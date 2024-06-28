const productDatabase = require("../../model/productsModel");
const userDatabase = require("../../model/user");
const cartDatabase = require("../../model/cartModel");
const categoryDatabase = require("../../model/categoryModel");
const offerDatabase = require("../../model/offerModal");
const ratingModel = require('../../model/ratingModel');
// const mongoose = require("mongoose");
// const Review = require('../../model/ratingModel');


// Function to apply offer to a product
const applyOffer = async (product) => {
  const productOffer = await offerDatabase.findOne({ product_name: product._id, unlist: true });
  const categoryOffer = await offerDatabase.findOne({ category_name: product.category, unlist: true });

  if (productOffer && typeof productOffer.discount_Amount === 'number') {
    product.offerPrice = Math.round(product.price - (product.price * (productOffer.discount_Amount / 100)));
  } else if (categoryOffer && typeof categoryOffer.discount_Amount === 'number') {
    product.offerPrice = Math.round(product.price - (product.price * (categoryOffer.discount_Amount / 100)));
  } else {
    product.offerPrice = null;
  }
  return product;
};

const calculateAverageRating = async (productId) => {
  const reviews = await ratingModel.find({ product: productId });
  if (reviews.length === 0) return { averageRating: 0, totalReviews: 0 };
  
  const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
  const averageRating = totalRating / reviews.length;
  return { averageRating, totalReviews: reviews.length };
};

const mongoose = require('mongoose');

const getProduct = async (req, res) => {
  try {
    
    const productId = req.query.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    let product = await productDatabase.findById(productId).populate('category');
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const isUser = req.session.user !== undefined;
    const cart = isUser ? await cartDatabase.findOne({ user: req.session.user._id }).populate('items.productId') : null;

    // Fetch reviews for the product
    const reviews = await ratingModel.find({ product: productId }).populate('user', 'firstname');

    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;

    // Calculate full stars and half stars
    const fullStars = Math.floor(averageRating);
    const hasHalfStar = averageRating % 1 >= 0.5;

    let stockStatus = '';
    let stockColor = '';
    if (product.stock > 0) {
      stockStatus = `In Stock (${product.stock} left)`;
      stockColor = 'green';
    } else {
      stockStatus = 'Out of Stock';
      stockColor = 'red';
    }

    // Apply offer to the product
    product = await applyOffer(product);

    // Apply offers to cart items
    if (cart && cart.items && cart.items.length > 0) {
      cart.items = await Promise.all(cart.items.map(async (item) => {
        item.productId = await applyOffer(item.productId);
        return item;
      }));
    }

    // Recommended products logic
    const recommendedProducts = await Promise.all((await productDatabase.find({
      category: product.category,
      _id: { $ne: productId }
    }).limit(5)).map(async (recProduct) => {
      return await applyOffer(recProduct);
    }));

    const userId = isUser ? req.session.user._id : null;

    res.render('productDetails', {
      product,
      reviews,
      averageRating,
      fullStars,
      hasHalfStar,
      stockStatus,
      stockColor,
      userId,
      cart,
      recommendedProducts,
      user: req.session.user || null,
      message: 'Product details fetched successfully'
    });
  } catch (error) {
  
    res.status(500).json({ message: 'Error fetching product details' });
  }
};


const catFilter = async (req, res) => {
  try {
    const { category: categoryFilter, q: searchQuery, sort: sortFilter } = req.query;

    const categoryId = categoryFilter?.toString() || 'All';

    const isUser = req.session.user !== undefined;

    // Fetch categories
    const categories = await categoryDatabase.find();

    // Filter products based on category
    let selectedProduct;
    if (categoryFilter && categoryFilter !== 'All') {
      selectedProduct = await productDatabase.find({ category: categoryFilter, list: 'listed' }).populate('category');
    } else {
      selectedProduct = await productDatabase.find({ list: 'listed' }).populate('category');
    }

    // Apply search query if present
    if (searchQuery) {
      selectedProduct = selectedProduct.filter(product =>
        product.product_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply sorting if present

    if (sortFilter) {
      const sortCriteria = JSON.parse(sortFilter);
      selectedProduct.sort((a, b) => {
        const field = Object.keys(sortCriteria)[0];
        const order = sortCriteria[field];
        return (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * order;
      });
    }

    // Apply offers to the products
    selectedProduct = await Promise.all(selectedProduct.map(applyOffer));

    selectedProduct = await Promise.all(selectedProduct.map(async (product) => {
      const { averageRating, totalReviews } = await calculateAverageRating(product._id);
      const discountPercentage = product.offerPrice ? ((product.price - product.offerPrice) / product.price * 100).toFixed(0) : null;
      return {
        ...product._doc,
        discountPercentage: discountPercentage,
        originalPrice: product.price,
        price: product.offerPrice || product.price,
        averageRating,
        totalReviews
      };
    }));
    // console.log(selectedProduct,"12345678");

    // Determine selected category
    const selectedCategory = categoryFilter || 'All';

    // Check if user session exists and retrieve cart if user is logged in
    const cart = isUser ? await cartDatabase.findOne({ user: req.session.user._id }).populate('items.productId') : null;
// console.log("selectedProduct",selectedProduct);
    // Render the shop page with filtered products and categories
    res.render('shop', { 
      categories, 
      isUser, 
      selectedProduct, 
      selectedCategory, 
      selectedSort: sortFilter || '{"_id": 1}', 
      cart,
      searchQuery: searchQuery || ''  // Add this line
    });
  } catch (error) {

    res.status(500).send('Internal Server Error');
  }
};

module.exports = { getProduct, catFilter };
