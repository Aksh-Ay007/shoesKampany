const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    offerName: {
        type: String,
        required: true // Assuming offerName is required
    },
    product_name: {
        type: mongoose.Schema.ObjectId,
        ref: 'productDatabase'
    },
    category_name: {
        type: mongoose.Schema.ObjectId,
        ref: 'categorydb'
    },
    discount_Amount: {
        type: Number
    },
    expiryDate: {
        type: Date,
        default: function () {
            const currentDate = new Date();
            currentDate.setHours(0, 0, 0, 0);
            return currentDate.toISOString();  // Ensure ISO 8601 format
        }
    },
    unlist: {
        type: Boolean,
        default: true
    }
});

const offerDatabase = mongoose.model("offerDatabase", offerSchema);

module.exports = offerDatabase;
