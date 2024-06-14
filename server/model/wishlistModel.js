const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const wishlistSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'UserDatabase', required: true },
    items: [
        {
            productId: { type: Schema.Types.ObjectId, ref: 'productDatabase', required: true }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);
