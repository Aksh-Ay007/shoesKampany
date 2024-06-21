const productDatabase = require("../../model/productsModel");
const userDatabase = require("../../model/user");
const cartDatabase = require("../../model/cartModel");
const categoryDatabase = require("../../model/categoryModel");
const offerDatabase = require("../../model/offerModal");
const Review = require('../../model/ratingModel');


// Function to apply offer to a product
const applyOffer = async (product) => {
  const productOffer = await offerDatabase.findOne({ product_name: product._id, unlist: true });
  const categoryOffer = await offerDatabase.findOne({ category_name: product.category, unlist: true });
  
  let discountPercentage = 0;

  if (productOffer && typeof productOffer.discount_Amount === 'number') {
    discountPercentage = productOffer.discount_Amount;
  } else if (categoryOffer && typeof categoryOffer.discount_Amount === 'number') {
    discountPercentage = categoryOffer.discount_Amount;
  }

  if (discountPercentage > 0) {
    product.offerPrice = Math.round(product.price - (product.price * (discountPercentage / 100)));
    product.discountPercentage = discountPercentage;
  } else {
    product.offerPrice = null;
    product.discountPercentage = 0;
  }

  return product;
};

// Get Product Controller
// Get Product Controller
const getProduct = async (req, res) => {
  try {
    const productId = req.query.id;
    let product = await productDatabase.findById(productId).populate('category');
    const isUser = req.session.user !== undefined;
    const cart = isUser ? await cartDatabase.findOne({ user: req.session.user._id }).populate('items.productId') : null;
    
    // Fetch reviews for the product
    const reviews = await Review.find({ product: productId }).populate('user', 'firstname');

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

    res.render("productDetails", { 
      isUser, 
      product, 
      cart, 
      stockStatus, 
      stockColor,
      reviews,
      averageRating,
      fullStars,
      hasHalfStar,
      totalReviews: reviews.length
    });
  } catch (e) {
    console.error(e);
    res.status(500).render("../error");
  }
};

// Category Filter Controller
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

    // Determine selected category
    const selectedCategory = categoryFilter || 'All';

    // Check if user session exists and retrieve cart if user is logged in
    const cart = isUser ? await cartDatabase.findOne({ user: req.session.user._id }).populate('items.productId') : null;

    // Render the shop page with filtered products and categories
    res.render('shop', { categories, isUser, selectedProduct, selectedCategory, selectedSort: sortFilter || '{"_id": 1}', cart });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = { getProduct, catFilter };
