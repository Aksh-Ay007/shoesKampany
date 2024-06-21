const express = require("express");
const router = express.Router();
const userController = require("../controller/user/userController");
const otpController = require("../controller/user/otpController");
const shopController = require("../controller/user/shopController");
const productController = require("../controller/user/productController");
const cartController = require('../controller/user/cartController');
const wishlistController = require("../controller/user/wishlistController");
const checkoutController = require('../controller/user/checkoutController');
const isAuthenticated = require('../middleware/isAuthenticated');
const { block } = require('../middleware/userControls');
const nocache = require('nocache');
const walletController = require('../controller/user/walletController');
const ratingController=require('../controller/user/ratingController');


// Home
router.get('/', block, userController.home);

//google auth
router.get('/auth/google',userController.googleAuth)
router.get('/auth/google/callback',userController.googleAuthCallback)

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
router.post('/postforgotpassword', userController.postForgotPassword);
router.get('/getnewPassword', userController.getNewPassword);
router.post('/newPassword', userController.postNewPassword);
router.get('/resendForgotOtp', userController.getForgotResendOtp);
router.get('/logout', block, userController.userlogout);

// Shop and Product
router.get('/shop', block, shopController.getShop);
router.get('/product', block, productController.getProduct);
router.get('/filter', productController.catFilter);

// Cart and Wishlist
router.get('/shoping-cart', cartController.getCart);
router.post('/shoping-cart/:id', cartController.addtocart);
router.delete('/delete/:id', cartController.deleteCartItem);
router.get('/quantity/:id', cartController.quantity);
router.get('/wishlist', wishlistController.getWishlist);
router.post('/wishlist/:id', wishlistController.addToWishlist);
router.delete('/wishlist/remove/:id', wishlistController.removeWishlist);

// Checkout and Order
router.get('/checkout', checkoutController.getCheckout);
router.post('/placeOrder', checkoutController.postOrder);
router.post('/createOrder', checkoutController.postRazorpay);
router.post('/handlePayment', checkoutController.razorpay);
router.post("/applyCoupon", checkoutController.applyCoupon);
router.get('/vieworder', checkoutController.viewOrders);
router.get('/vieworderdetail', checkoutController.viewOrderDetail);
router.get('/viewsingleorder', checkoutController.singleOrder);
router.get('/successPage', checkoutController.sucessPage);
router.get('/cancelOrder/:id', checkoutController.getCancelOrder);
router.post('/returnOrder/:id', checkoutController.postReturnOrder);
router.get('/download-invoice/:orderId', checkoutController.downloadInvoice);
router.post('/handleFailedPayment', checkoutController.handleFailedPayment);
router.post('/submitReview',ratingController.submitReview)

// router.post('/handleRetryPayment', checkoutController.handleRetryPayment)

router.post('/getOrderDetails',checkoutController.handleRetryPayment)


router.put('/changeToSucess',checkoutController.changeStatus)




//wallet

router.get('/wallet', walletController.getWallet);
router.post('/wallet/add', walletController.addToWallet);
router.get('/wallet/history', walletController.getWalletHistory);

router.get('/wallet/transactions',checkoutController .getWalletTransactions);
router.get('/getWalletBalance',checkoutController.getWalletBalance)

// User Profile
router.get('/profile', userController.Showprofile);
router.get('/addaddress', userController.getAddress);
router.post('/addaddress', userController.addaddress);
router.get('/manageAddresses', userController.getmanageAddress);
router.delete('/deleteAddress/:id', userController.deleteAddress);
router.get('/editaddress/:id', userController.showEditAddress);
router.post('/saveaddress/:id', userController.saveAddress);
router.get('/changename', userController.showEditUsername);
router.post('/savename', userController.editUsername);
router.post('/checkoutaddress', userController.checkoutaddress);
router.post('/addaddresss', checkoutController.addAddressController);


// Catch-all route for undefined routes
router.get('**', (req, res) => {
  res.render('../error');
});

module.exports = router;