const productDatabase = require("../../model/productsModel");
const userDatabase = require("../../model/user");
const cartDatabase = require("../../model/cartModel");
const categoryDatabase = require("../../model/categoryModel");
const offerDatabase = require("../../model/offerModal"); // Ensure this path is correct
const applyOffer = async (product) => {
  if (!product) {
    return null;
  }

  const productOffer = await offerDatabase.findOne({ product_name: product._id, unlist: true });
  const categoryOffer = await offerDatabase.findOne({ category_name: product.category, unlist: true });

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

const getShop = async (req, res) => {
  const isUser = req.session.user !== undefined;
  try {
    const categoryId = req.query.category;
    const categories = await categoryDatabase.find();
    const cart = req.session.user ? await cartDatabase.findOne({ user: req.session.user._id }).populate('items.productId') : null;

    let selectedProduct;
    if (categoryId) {
      selectedProduct = await productDatabase.find({ category: categoryId, list: 'listed' });
    } else {
      selectedProduct = await productDatabase.find({ list: 'listed' });
    }

    selectedProduct = await Promise.all(selectedProduct.map(applyOffer));

    if (cart && cart.items && cart.items.length > 0) {
      cart.items = await Promise.all(cart.items.map(async (item) => {
        item.productId = await applyOffer(item.productId);
        return item;
      }));
    }

    let selectedCategory = "All";
    const selectedSort = '{"_id": 1}';

    res.render('shop', { selectedCategory, isUser, categories, selectedSort, selectedProduct, cart });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

module.exports = { getShop };
