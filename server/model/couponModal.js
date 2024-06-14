const mongoose = require('mongoose')
const { Schema } = mongoose

const couponSchema = new Schema({
    coupon_Name: {
        type: String
    },
    coupon_Code: {
        type: String
    },
    discount_Amount: {
        type: Number
    },
    minimum_Amount: {
        type: Number
    },
    maximum_Amount: {
        type: Number
    },
    expiry_Date: {
        type: Date
    },
    blocked: {
        type: Boolean,
        default: true
    }
})

const CouponDatabase = mongoose.model("CouponDatabase", couponSchema)

module.exports = CouponDatabase