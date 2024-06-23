const mongoose = require("mongoose");

var productsSchema = new mongoose.Schema({
  product_name: {
    type: String,
    required: true,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'categorydb',
    required: true,
  },
  brand: {
    type: String,
  },
  price: {
    type: Number,
  },
  color: {
    type: String,
  },
  size: {
    type: String,
  },
  description: {
    type: String,
  },
  list: {
    type: String,
    default: "listed",
  },
  discount: {
    type: Number,
  },
  stock: {
    type: Number,
    required: true,
  },
  images: {
    type: [String],
  },
  offerApplied: {
    type: Boolean,
    default: false,
  },
  offerDetails: {
    offerName: {
      type: String,
    },
    discountAmount: {
      type: Number,
    },
    discountPercentage: {
      type: Number, // Store discount percentage
    },
  },
  finalPrice: {
    type: Number,
    default: function() {
      return this.price; // Default to the price field if finalPrice is not set
    }
  },
});

const productDatabase = mongoose.model("productDatabase", productsSchema);

module.exports = productDatabase;
