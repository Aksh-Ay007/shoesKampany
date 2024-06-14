const CouponDatabase = require("../../model/couponModal");
const moment = require('moment');

const getCouponManage = async (req, res) => {
    try {
        const coupons = await CouponDatabase.find();
        
        const mappedCoupons = coupons.map(coupon => ({
            _id: coupon._id,
            couponName: coupon.coupon_Name,
            couponCode: coupon.coupon_Code,
            discountAmount: coupon.discount_Amount,
            minimumPurchaseAmount: coupon.minimum_Amount,
            maximumPurchaseAmount: coupon.maximum_Amount,
            expiryDate: coupon.expiry_Date,
            isActive: !coupon.blocked
        }));
        
        res.render("couponManagement", { coupons: mappedCoupons, moment: moment });
    } catch (error) {
        console.error(error);
        res.render("error", { message: "Error fetching coupons" });
    }
};

const getAddCoupon = async (req, res) => {
    try {
        res.render('addCoupon');
    } catch (error) {
        console.error(error);
        res.status(500).send("Error occurred while rendering add coupon page");
    }
};

const postAddCoupon = async (req, res) => {
    try {
        const { name, code, discount, minPurchase, maxPurchase, expiryDate } = req.body;
        
        const newCoupon = new CouponDatabase({
            coupon_Name: name,
            coupon_Code: code,
            discount_Amount: discount,
            minimum_Amount: minPurchase,
            maximum_Amount: maxPurchase,
            expiry_Date: new Date(expiryDate),
            blocked: false
        });
        
        await newCoupon.save();
        res.redirect('/admin/couponmanage');
    } catch (error) {
        console.error(error);
        res.status(500).send("Error occurred while adding coupon");
    }
};

const getEditCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await CouponDatabase.findById(couponId);
        
        if (!coupon) {
            return res.status(404).send("Coupon not found");
        }
        
        res.render('editCoupon', { coupon: coupon, moment: moment });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error occurred while rendering edit coupon page");
    }
};

const postEditCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        const { name, code, discount, minPurchase, maxPurchase, expiryDate } = req.body;
        
        await CouponDatabase.findByIdAndUpdate(couponId, {
            coupon_Name: name,
            coupon_Code: code,
            discount_Amount: discount,
            minimum_Amount: minPurchase,
            maximum_Amount: maxPurchase,
            expiry_Date: new Date(expiryDate)
        });
        
        res.redirect('/admin/couponmanage');
    } catch (error) {
        console.error(error);
        res.status(500).send("Error occurred while updating coupon");
    }
};

const activateCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        await CouponDatabase.findByIdAndUpdate(couponId, { blocked: false });
        res.redirect('/admin/couponmanage');
    } catch (error) {
        console.error(error);
        res.status(500).send("Error occurred while activating coupon");
    }
};

const deactivateCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        await CouponDatabase.findByIdAndUpdate(couponId, { blocked: true });
        res.redirect('/admin/couponmanage');
    } catch (error) {
        console.error(error);
        res.status(500).send("Error occurred while deactivating coupon");
    }
};

module.exports = {
    getCouponManage,
    getAddCoupon,
    postAddCoupon,
    getEditCoupon,
    postEditCoupon,
    activateCoupon,
    deactivateCoupon
};