const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderSchema = new Schema({
    user_id: {
        type: mongoose.Types.ObjectId,
        ref: "UserDatabase",
        required: true
    },
    name: {
        type: String,
        required: false,
    },
    orderedItems: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'productDatabase',
            required: true
        },
        productname: {
            type: String,
            required: true
        },
        productimages: {
            type: [String],
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        quantity: {
            type: Number,
            min: 1,
            max: 5,
            required: true
        },
        status: {
            type: String,
            default: "Pending",
            enum: ['Pending', 'Shipped', 'Processing', 'Delivered', 'Cancelled', 'Returned',],
        },
        returned: {
            type: Boolean,
            default: false
        }
    }],
    status: {
        type: String,
        default: "Pending",
        enum: ['Pending', 'Shipped', 'Processing', 'Delivered', 'Cancelled', 'Returned']
    },
    returned: {
        type: Boolean,
        default: false
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled', 'Refunded',"failure"],
        default: 'Pending',
    },
    shippingAddress: {
        type: Schema.Types.ObjectId,
        ref: 'addressDatabase',
        required: true
    },
    paymentMethod: {
        type: String,
        required: true,
        enum: ['COD', 'RazorPay', 'Wallet'] // Added 'Wallet' as a payment method
    },
    orderDate: {
        type: Date,
        default: Date.now
    },
    totalAmount: {
        type: Number,
        required: true
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    deliveryCharge: { // Added delivery charge field
        type: Number,
        default: 0
    }
});

const OrderDatabase = mongoose.model('OrderDatabase', orderSchema);
module.exports = OrderDatabase;