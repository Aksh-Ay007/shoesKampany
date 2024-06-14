const mongoose = require('mongoose');

var categorySchema = new mongoose.Schema({
  categoryName: {
    type: String,
    required: true
  },
  list: {
    type: String,
    enum: ["listed", "unlisted"],
    default: "listed"
  },
  description: {
    type: String,
  }
});

const categoryDatabase = mongoose.model('categorydb', categorySchema);

module.exports = categoryDatabase;