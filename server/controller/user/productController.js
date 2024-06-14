const productDatabase = require("../../model/productsModel");
const userDatabase = require("../../model/user");
const cartDatabase = require("../../model/cartModel");
const categoryDatabase = require("../../model/categoryModel");
const offerDatabase = require("../../model/offerModal");

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

// Get Product Controller
const getProduct = async (req, res) => {
  try {
    const productId = req.query.id;
    let product = await productDatabase.findById(productId).populate('category');
    const isUser = req.session.user !== undefined;
    const cart = isUser ? await cartDatabase.findOne({ user: req.session.user._id }).populate('items.productId') : null;

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

    res.render("productDetails", { isUser, product, cart, stockStatus, stockColor });
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
