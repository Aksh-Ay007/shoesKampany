const productDatabase = require("../../model/productsModel");
const userDatabase = require("../../model/user");
const cartDatabase = require("../../model/cartModel");
const categorydb = require("../../model/categoryModel");
const categoryDatabase = require("../../model/categoryModel");

const getProduct = async (req, res) => {
  try {
    const productId = req.query.id;
    const product = await productDatabase.findById(productId);
    const cart = await cartDatabase.findOne({ user: req.session.user._id }).populate('items.productId');

    const isUser = req.session.user !== undefined;

    let stockStatus = '';
    let stockColor = '';
    if (product.stock > 0) {
      stockStatus = `In Stock (${product.stock} left)`;
      stockColor = 'green';
    } else {
      stockStatus = 'Out of Stock';
      stockColor = 'red';
    }

    res.render("productDetails", { isUser, product, cart, stockStatus, stockColor });
  } catch (e) {
    res.status(500).render("../error");
  }
};



const catFilter = async (req, res) => {
  try {
    const { category: categoryFilter, q: searchQuery, sort: sortFilter } = req.query;
    const categoryId = req.query.category?.toString() || 'All';

    const isUser = req.session.user !== undefined;

    // Fetch categories
    const categories = await categoryDatabase.find();

    // Filter products based on category
    let selectedProduct;
    if (categoryFilter && categoryFilter !== 'All') {
      selectedProduct = await productDatabase.find({ category: categoryFilter, list: 'listed' });
    } else {
      selectedProduct = await productDatabase.find({ list: 'listed' });
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

    // Determine selected category
    const selectedCategory = categoryFilter || 'All';

    const cart = await cartDatabase.findOne({ user: req.session.user._id }).populate('items.productId');

    // Render the shop page with filtered products and categories
    res.render('shop', { categories, isUser, selectedProduct, selectedCategory, selectedSort: sortFilter || '{"_id": 1}', cart });

  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};




module.exports = { getProduct,catFilter};
