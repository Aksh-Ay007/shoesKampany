const OfferDatabase = require("../../model/offerModal");
const ProductDatabase = require("../../model/productsModel");
const CategoryDatabase = require("../../model/categoryModel");
const mongoose = require('mongoose');
const moment = require('moment');

// Get all offers
const getOffers = async (req, res) => {
  try {
    const offers = await OfferDatabase.find()
      .populate('product_name', 'product_name')
      .populate('category_name', 'categoryName');

    offers.forEach(offer => {
      offer.formattedExpiryDate = moment(offer.expiryDate).format('DD/MM/YYYY');
    });

    res.render('offerManagement', { offers });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error occurred while rendering offer management page");
  }
};

// Get the page to add a new offer
const getAddOffer = async (req, res) => {
  try {
    const products = await ProductDatabase.find({}, 'product_name');
    const categories = await CategoryDatabase.find({}, 'categoryName');

    res.render('addOffer', { products, categories });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error occurred while fetching product and category data");
  }
};

const postAddOffer = async (req, res) => {
  try {
    const { offerName, offerType, productId, categoryId, productDiscount, categoryDiscount, expiryDate } = req.body;

    if (offerType === 'category' && !categoryId) {
      return res.status(400).send("Category ID is required for category offer");
    }

    if (offerType === 'product' && !productId) {
      return res.status(400).send("Product ID is required for product offer");
    }

    let productExists = true;
    let categoryExists = true;

    if (productId) {
      productExists = await ProductDatabase.exists({ _id: productId });
    }

    if (categoryId) {
      categoryExists = await CategoryDatabase.exists({ _id: categoryId });
    }

    if (!productExists) {
      return res.status(400).send("The selected product does not exist");
    }

    if (!categoryExists) {
      return res.status(400).send("The selected category does not exist");
    }

    const existingOffer = offerType === 'product'
      ? await OfferDatabase.findOne({ product_name: productId })
      : await OfferDatabase.findOne({ category_name: categoryId });

    if (existingOffer) {
      const errorMessage = `An offer already exists for the selected ${offerType}`;
      const products = await ProductDatabase.find({}, 'product_name');
      const categories = await CategoryDatabase.find({}, 'categoryName');
      return res.render('addOffer', { products, categories, errorMessage });
    }

    const duplicateOfferName = await OfferDatabase.findOne({ offerName });
    if (duplicateOfferName) {
      const errorMessage = "An offer with this name already exists";
      const products = await ProductDatabase.find({}, 'product_name');
      const categories = await CategoryDatabase.find({}, 'categoryName');
      return res.render('addOffer', { products, categories, errorMessage });
    }

    if (moment(expiryDate).isBefore(moment(), 'day')) {
      const errorMessage = "Expiry date cannot be a past date";
      const products = await ProductDatabase.find({}, 'product_name');
      const categories = await CategoryDatabase.find({}, 'categoryName');
      return res.render('addOffer', { products, categories, errorMessage });
    }

    const newOffer = new OfferDatabase({
      offerName,
      offerType,
      product_name: mongoose.Types.ObjectId.isValid(productId) ? productId : null,
      category_name: mongoose.Types.ObjectId.isValid(categoryId) ? categoryId : null,
      discount_Amount: productDiscount || categoryDiscount,
      expiryDate,
      unlist: true
    });

    await newOffer.save();
    res.redirect('/admin/offermanage');
  } catch (error) {
    console.error(error);
    res.status(500).send("Error occurred while adding offer");
  }
};

// Get the page to edit an offer
const getEditOffer = async (req, res) => {
  try {
    const offerId = req.params.id;
    const offer = await OfferDatabase.findById(offerId)
      .populate('product_name')
      .populate('category_name');

    if (!offer) {
      return res.status(404).send("Offer not found");
    }

    const products = await ProductDatabase.find();
    const categories = await CategoryDatabase.find();

    res.render('editOffer', { offer, products, categories, moment });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error occurred while rendering edit offer page");
  }
};

// Update an existing offer
const postEditOffer = async (req, res) => {
  try {
    const offerId = req.params.id;
    const { offerName, productId, categoryId, discount, expiryDate } = req.body;

    const existingOffer = await OfferDatabase.findById(offerId);

    if (!existingOffer) {
      return res.status(404).send("Offer not found");
    }

    if (moment(expiryDate).isBefore(moment(), 'day')) {
      const errorMessage = "Expiry date cannot be a past date";
      const offer = await OfferDatabase.findById(offerId)
        .populate('product_name')
        .populate('category_name');
      const products = await ProductDatabase.find();
      const categories = await CategoryDatabase.find();
      return res.render('editOffer', { offer, products, categories, moment, errorMessage });
    }

    const duplicateOfferName = await OfferDatabase.findOne({ offerName, _id: { $ne: offerId } });
    if (duplicateOfferName) {
      const errorMessage = "An offer with this name already exists";
      const offer = await OfferDatabase.findById(offerId)
        .populate('product_name')
        .populate('category_name');
      const products = await ProductDatabase.find();
      const categories = await CategoryDatabase.find();
      return res.render('editOffer', { offer, products, categories, moment, errorMessage });
    }

    const updatedOffer = await OfferDatabase.findByIdAndUpdate(offerId, {
      offerName,
      product_name: productId || null,
      category_name: categoryId || null,
      discount_Amount: discount,
      expiryDate,
    }, { new: true })
    .populate('product_name', 'product_name')
    .populate('category_name', 'categoryName');

    res.redirect('/admin/offermanage');
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};


// Unlist an offer
const unlistOffer = async (req, res) => {
  try {
    const offerId = req.params.id;
    await OfferDatabase.findByIdAndUpdate(offerId, { unlist: true });
    res.redirect('/admin/offermanage');
  } catch (error) {
    console.error(error);
    res.status(500).send("Error occurred while unlisting offer");
  }
};

// List an offer
const listOffer = async (req, res) => {
  try {
    const offerId = req.params.id;
    await OfferDatabase.findByIdAndUpdate(offerId, { unlist: false });
    res.redirect('/admin/offermanage');
  } catch (error) {
    console.error(error);
    res.status(500).send("Error occurred while listing offer");
  }
};

module.exports = {
  getOffers,
  getAddOffer,
  postAddOffer,
  getEditOffer,
  postEditOffer,
  unlistOffer,
  listOffer
};
