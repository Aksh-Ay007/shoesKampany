const express = require("express");
const router = express.Router();
const userController = require("../controller/user/userController");
const otpController = require("../controller/user/otpController");
const shopController = require("../controller/user/shopController");
const productController = require("../controller/user/productController");
const cartController = require('../controller/user/cartController');
const wishlistController = require("../controller/user/wishlistController");
const checkoutController = require('../controller/user/checkoutController');
const isAuthenticated = require('../middleware/isAuthenticated'); // Import your authentication middleware
const { block } = require('../middleware/userControls'); // Import your block middleware
const nocache = require('nocache');
const walletController = require('../controller/user/walletController');
const ratingController=require('../controller/user/ratingController');


// Middleware
router.use(nocache()); // Using nocache middleware globally

// Home
router.get('/',  userController.home);

// Google Auth
router.get('/auth/google', userController.googleAuth);
router.get('/auth/google/callback', userController.googleAuthCallback);

// User Authentication
router.get('/userlogin', userController.userLogin);
router.post('/userlogin', userController.postLogin);
router.get('/usersignup', userController.signup);
router.post('/usersignup', userController.postSignup);
router.get('/otp', otpController.getsignupOtp);
router.post('/postSignupOtp', otpController.postSignupOtp);
router.get('/resendOtp', userController.getResendOtp);
router.get('/forgototp', otpController.getForgotOtp);
router.post('/postforgototp', otpController.postForgotOtp);
router.get('/forgotpassword', userController.getForgotPassword);
router.post('/postforgotpassword', userController.postNewPassword);
router.get('/getnewPassword', userController.getNewPassword);
router.post('/newPassword', userController.postNewPassword);
router.get('/resendForgotOtp', userController.getForgotResendOtp);
router.get('/logout', block, userController.userlogout);

// Shop and Product
router.get('/shop', block, shopController.getShop);
router.get('/product', block, productController.getProduct);
router.get('/filter', productController.catFilter);

// Cart and Wishlist
router.get('/shoping-cart', block, cartController.getCart);
router.post('/shoping-cart/:id', block, cartController.addtocart);
router.delete('/delete/:id', block, cartController.deleteCartItem);
router.get('/quantity/:id', block, cartController.quantity);
router.get('/wishlist', block, wishlistController.getWishlist);
router.post('/wishlist/:id', block, wishlistController.addToWishlist);
router.delete('/wishlist/remove/:id', block, wishlistController.removeWishlist);

// Checkout and Order
router.get('/checkout', block, checkoutController.getCheckout);
router.post('/placeOrder', block, checkoutController.postOrder);
router.post('/createOrder', block, checkoutController.postRazorpay);
router.post('/handlePayment', block, checkoutController.razorpay);
router.post("/applyCoupon", block, checkoutController.applyCoupon);
router.get('/vieworder', block, checkoutController.viewOrders);
router.get('/vieworderdetail', block, checkoutController.viewOrderDetail);
router.get('/viewsingleorder', block, checkoutController.singleOrder);
router.get('/successPage', block, checkoutController.sucessPage);
router.get('/cancelOrder/:id', block, checkoutController.getCancelOrder);
router.post('/returnOrder/:id', block, checkoutController.postReturnOrder);
router.get('/download-invoice/:orderId', block, checkoutController.downloadInvoice);
router.post('/handleFailedPayment', block, checkoutController.handleFailedPayment);
router.post('/submitReview', block, ratingController.submitReview);
router.put('/reviews/:reviewId', block, ratingController.editReview);

// Wallet
router.get('/wallet', block, walletController.getWallet);
router.post('/wallet/add', block, walletController.addToWallet);
router.get('/wallet/history', block, walletController.getWalletHistory);
router.get('/wallet/transactions', block, checkoutController.getWalletTransactions);
router.get('/getWalletBalance', block, checkoutController.getWalletBalance);

// User Profile
router.get('/profile', block, userController.Showprofile);
router.get('/addaddress', block, userController.getAddress);
router.post('/addaddress', block, userController.addaddress);
router.get('/manageAddresses', block, userController.getmanageAddress);
router.delete('/deleteAddress/:id', block, userController.deleteAddress);
router.get('/editaddress/:id', block, userController.showEditAddress);
router.post('/saveaddress/:id', block, userController.saveAddress);
router.get('/changename', block, userController.showEditUsername);
router.post('/savename', block, userController.editUsername);
router.post('/checkoutaddress', block, userController.checkoutaddress);
router.post('/addaddresss', block, checkoutController.addAddressController);

// Catch-all route for undefined routes
router.get('**', (req, res) => {
  res.render('../error');
});

module.exports = router;
