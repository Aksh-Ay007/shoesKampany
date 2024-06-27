const productDatabase = require("../../model/productsModel");
const userDatabase = require("../../model/user");
const cartDatabase = require("../../model/cartModel");
const categoryDatabase = require("../../model/categoryModel");
const offerDatabase = require("../../model/offerModal"); // Ensure this path is correct
const Review = require('../../model/ratingModel');

const applyOffer = async (product) => {


  const productOffer = await offerDatabase.findOne({ product_name: product._id, unlist: true });
  const categoryOffer = await offerDatabase.findOne({ category_name: product.category, unlist: true });
  let discountPercentage = 0;

  if (productOffer && typeof productOffer.discount_Amount === 'number') {
    product.offerPrice = Math.round(product.price - (product.price * (productOffer.discount_Amount / 100)));
  } else if (categoryOffer && typeof categoryOffer.discount_Amount === 'number') {
    product.categoryOffer = categoryOffer; // Assign category offer to the product
    product.offerPrice = Math.round(product.price - (product.price * (categoryOffer.discount_Amount / 100)));
  } else {
    product.offerPrice = null;
  }
  return product;
};

const calculateAverageRating = async (productId) => {
  const reviews = await Review.find({ product: productId });
  if (reviews.length === 0) return { averageRating: 0, totalReviews: 0 };
  
  const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
  const averageRating = totalRating / reviews.length;
  return { averageRating, totalReviews: reviews.length };
};

const getShop = async (req, res) => {
  const isUser = req.session.user !== undefined;
  try {
    const categoryId = req.query.category;
    const searchQuery = req.query.q;
    const sortFilter = req.query.sort;
    if (!req.session.user) {
      return res.redirect('/userlogin');
    }


    const categories = await categoryDatabase.find();
    const cart = req.session.user ? await cartDatabase.findOne({ user: req.session.user._id }).populate('items.productId') : null;

    let selectedProduct;
    if (categoryId && categoryId !== 'All') {
      selectedProduct = await productDatabase.find({ category: categoryId, list: 'listed' });
    } else {
      selectedProduct = await productDatabase.find({ list: 'listed' });
    }

    // Apply search filter if exists
    if (searchQuery) {
      selectedProduct = selectedProduct.filter(product => 
        product.product_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply offers and calculate ratings
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

    // Apply sorting if present
    if (sortFilter) {
      const sortCriteria = JSON.parse(sortFilter);
      selectedProduct.sort((a, b) => {
        const field = Object.keys(sortCriteria)[0];
        const order = sortCriteria[field];
        return (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * order;
      });
    }

    if (cart && cart.items && cart.items.length > 0) {
      cart.items = await Promise.all(cart.items.map(async (item) => {
        item.productId = await applyOffer(item.productId);
        return item;
      }));
    }

    let selectedCategory = categoryId || "All";
    const selectedSort = sortFilter || '{"_id": 1}';

// console.log("selectedProduct",selectedProduct);     

    res.render('shop', { 
      selectedCategory, 
      isUser, 
      categories, 
      selectedSort, 
      selectedProduct, 
      cart,
      searchQuery
    });
  } catch (error) {

    res.status(500).send("Internal Server Error");
  }
};

module.exports = { getShop };
