// orderController.js
const mongoose = require("mongoose");
const productDatabase = require("../../model/productsModel");
const addressDatabase = require("../../model/addressModel");
const userDatabase = require("../../model/user");
const OrderDatabase = require("../../model/orderModal");
const cartDatabase = require("../../model/cartModel");
const couponDatabase = require("../../model/couponModal");
const Wallet = require("../../model/walletModel");
const offerDatabase = require("../../model/offerModal");
const Razorpay = require("razorpay");
const PDFDocument = require('pdfkit');
const fs = require('fs');
const ratingDatabase=require('../../model/ratingModel')

const applyOffer = async (product, couponDiscount = 0) => {
  const productOffer = await offerDatabase.findOne({
    product_name: product._id,
    unlist: true,
  });
  const categoryOffer = await offerDatabase.findOne({
    category_name: product.category,
    unlist: true,
  });

  let discount = 0;

  if (productOffer && typeof productOffer.discount_Amount === "number") {
    discount = productOffer.discount_Amount;
  } else if (categoryOffer && typeof categoryOffer.discount_Amount === "number") {
    discount = categoryOffer.discount_Amount;
  }

  product.offerPrice = Math.round(product.price - product.price * (discount / 100));
  product.offerDiscount = Math.round(product.price * (discount / 100));

  // Subtract coupon discount from offer price if available
  if (couponDiscount > 0) {
    product.finalPrice = Math.max(0, product.offerPrice - couponDiscount);
  } else {
    product.finalPrice = product.offerPrice;
  }

  product.couponDiscount = couponDiscount;
  
  return product;
};


// Function to calculate offer discount for the entire cart
const calculateOfferDiscount = (items) => {
  let totalOfferDiscount = 0;
  items.forEach((item) => {
    if (item.productId.offerDiscount) {
      totalOfferDiscount += item.productId.offerDiscount * item.quantity;
    }
  });
  return totalOfferDiscount;
};


const getCheckout = async (req, res) => {
  try {
    const userId = req.session.user && req.session.user._id;
    
    if (!userId) {
      return res.redirect("/userlogin"); // Redirect to login if session user is not defined
    }

  
    const user = await userDatabase.findById(userId);
    const addresses = await addressDatabase.find({ user: userId });
    
    let cart = await cartDatabase
      .findOne({ user: userId })
      .populate("items.productId");

    if (!cart) {
      const emptyCart = { items: [], totalAmount: 0 };
      res.render("checkoutt", {
        addresses,
        user,
        cart: emptyCart,
        walletBalance: 0,
        errorMessage: "",
        coupon: [],
        errorMessage: "Your cart is empty. Please add items to your cart before checking out.",
        appliedCoupon: null,
      });
      return;
    }

    const availableCoupons = await couponDatabase.find({
      minimum_Amount: { $lte: cart.totalAmount },
      maximum_Amount: { $gte: cart.totalAmount },
    });

    let couponDiscount = 0;
    if (req.session.appliedCoupon) {
      couponDiscount = req.session.appliedCoupon.discountAmount;
    }

    // Apply offer prices to cart items and filter out null productIds
    cart.items = await Promise.all(
      cart.items.map(async (item) => {
        if (item.productId) {
          item.productId = await applyOffer(item.productId, couponDiscount);
          return item;
        }
      })
    );

    // Remove any null items
    cart.items = cart.items.filter(item => item.productId);

    // Calculate offer discount for the entire cart
    cart.offerDiscount = calculateOfferDiscount(cart.items);

    // Calculate total amount after discounts
    cart.finalAmount = cart.totalAmount - cart.offerDiscount - couponDiscount;

    // Add delivery charge if applicable
    let deliveryCharge = 0;
    if (cart.finalAmount <= 500) {
      deliveryCharge = 50;
    }
    cart.finalAmount += deliveryCharge;

    // Fetch the user's wallet balance
    const wallet = await Wallet.findOne({ user: userId });
    const walletBalance = wallet ? wallet.balance : 0;



    res.render("checkoutt", {
      addresses,
      user,
      cart,
      walletBalance,
      errorMessage: "",
      coupon: availableCoupons,
      appliedCoupon: req.session.appliedCoupon,
    });
  } catch (e) {

    res.status(500).send("Internal Error");
  }
};


const postOrder = async (req, res) => {
  console.log("post order is working ");
  try {
    const { addressId, cartId, paymentMethod, amountTotal, offerDiscount, discountAmount, deliveryCharge } = req.body;

 

    const userId = req.session.user._id;
    const AddressId = addressId;
    const payment = paymentMethod;

    const userCartData = await cartDatabase.findOne({ user: userId, _id: cartId }).populate("items.productId");

    if (!userCartData) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const orderedItems = userCartData.items.map((item) => ({
      productId: item.productId._id,
      productname: item.productId.product_name,
      productimages: item.productId.images,
      price: item.productId.price,
      finalPrice: item.productId.finalPrice || item.productId.price, // Use price as fallback
      quantity: item.quantity,
      status: "Pending",
      returned: false,
    }));

    const totalAmount = userCartData.totalAmount;

    const amountTotalValue = parseFloat(amountTotal.replace(/[^0-9.]/g, ""));
    const offerDiscountValue = parseFloat(offerDiscount.replace(/[^0-9.]/g, ""));
    const discountAmountValue = parseFloat(discountAmount.replace(/[^0-9.]/g, ""));
    const deliveryChargeValue = parseFloat(deliveryCharge.replace(/[^0-9.]/g, ""));

    if (isNaN(amountTotalValue) || isNaN(offerDiscountValue) || isNaN(discountAmountValue) || isNaN(deliveryChargeValue)) {
      return res.status(400).json({ error: "Invalid numeric value" });
    }

    if (paymentMethod === "COD" && totalAmount > 1000) {
      return res.status(400).json({ error: "COD payment is not allowed for orders over Rs. 1000" });
    }

    let paymentStatus = "Pending";

    if (paymentMethod === "Wallet") {
      let wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        wallet = new Wallet({
          user: userId,
          balance: 0,
          transactions: []
        });
        await wallet.save();
      }
      if (wallet.balance < amountTotalValue + deliveryChargeValue) {
        return res.status(400).json({ error: "Insufficient wallet balance" });
      }

      // Deduct amount from wallet
      wallet.balance -= amountTotalValue + deliveryChargeValue;
      wallet.transactions.push({
        type: "withdrawal",
        amount: amountTotalValue ,
        timestamp: new Date(),
        description: "Order payment",
      });
      await wallet.save();

      paymentStatus = "Completed";
    }

    const newOrder = new OrderDatabase({
      user_id: userId,
      orderedItems: orderedItems,
      status: "Pending",
      returned: false,
      paymentStatus: paymentStatus,
      shippingAddress: AddressId,
      paymentMethod: payment,
      totalAmount: totalAmount,
      finalAmount: amountTotalValue ,
      deliveryCharge: deliveryChargeValue,
      couponDiscount: discountAmountValue || 0,
      offerDiscount: offerDiscountValue || 0,
    });


    await newOrder.save();
    await cartDatabase.findOneAndDelete({ user: userId, _id: cartId });

    await Promise.all(
      userCartData.items.map(async (product) => {
        await productDatabase.findByIdAndUpdate(product.productId, {
          $inc: { stock: -product.quantity },
        });
      })
    );

    res.status(200).json({ message: "Order placed successfully", orderId: newOrder._id });
  } catch (error) {

    res.status(500).json({ error: "Error placing order" });
  }
};



const applyCoupon = async (req, res) => {
  try {
    const { couponCode, cartTotal } = req.body;

    const coupon = await couponDatabase.findOne({ coupon_Code: couponCode });

    if (!coupon) {
      return res.json({ message: "Invalid coupon code" });
    }

    const discountAmount = (coupon.discount_Amount / 100) * cartTotal;
    const total = cartTotal - discountAmount;

    res.json({ discountAmount, total });
  } catch (error) {

    res.status(500).json({ message: "Error applying coupon" });
  }
};

const sucessPage = (req, res) => {
  try {
    return res.render("orderplaced");
  } catch (error) {

    res.status(500).send("Error rendering order placed page");
  }
};


const viewOrders = async (req, res) => {
  const user = req.session.user;
  try {
    if (!req.session.user || !req.session.user._id) {
      return res.status(401).send("Unauthorized: Please log in first.");
    }

    const id = req.session.user._id;
    const orders = await OrderDatabase.find({ user_id: id })
      .populate("orderedItems.productId")
      .limit(5)
      .sort({ orderDate: -1 });

    res.render("userOrder", {
      orders,
      username: req.session.user.firstname,
      user,
    });
  } catch (error) {

    res.status(500).send("Internal Server Error");
  }
};

const viewOrderDetail = async (req, res) => {
  const user = req.session.user;
  try {
    if (!req.session.user || !req.session.user._id) {
      return res.status(401).send("Unauthorized: Please log in first.");
    }

    const orderId = req.query.oid;
    const name = req.session.user.firstname;
    const order = await OrderDatabase.findById(orderId).populate(
      "shippingAddress"
    );
    if (!order) {
      return res.status(404).send("No order found");
    }
    res.render("orderDetail", { order, name, user, orders: [order] });
  } catch (e) {

    res.status(500).send("Internal Server Error");
  }
};
const singleOrder = async (req, res) => {
  try {
    if (!req.session.user || !req.session.user._id) {
      return res.status(401).send("Unauthorized: Please log in first.");
    }

    const orderId = req.query.oid;
    const name = req.session.user.firstname;
    const order = await OrderDatabase.findById(orderId)
      .populate("shippingAddress")
      .populate({
        path: "orderedItems.productId",
        select: 'product_name images price offerPrice offerDiscount finalPrice'
      });

    if (!order) {
      return res.status(404).send("No order found");
    }

    // Fetch the reviews for the ordered items
    const reviews = await ratingDatabase.find({ order: orderId });

    // Map reviews to ordered items for easier access in the template
    const reviewsMap = reviews.reduce((acc, review) => {
      acc[review.productId.toString()] = review;
      return acc;
    }, {});

    res.render("orderDetail", { order, name, reviews: reviewsMap, orders: [order] });
  } catch (e) {

    res.status(500).send("Internal Server Error");
  }
};



const postRazorpay = async (req, res) => {
  try {

    const { totalPrice } = req.body;

    // Convert total price to an integer representing paise
    const totalAmountInPaise = Math.round(Number(totalPrice) * 100);


    const instance = new Razorpay({
      key_id: "rzp_test_OYzzRLNBCqZfkG",
      key_secret: "h2eDgR2HYioEqKWp9tYzfQNO",
    });

    const options = {
      amount: totalAmountInPaise, // Use the integer amount
      currency: "INR",
      receipt: "receipt#1",
    };


    instance.orders.create(options, (err, order) => {
      if (err) {

        return res
          .status(500)
          .json({ error: "Error creating order", details: err });
      }

      res.status(200).json({ orderId: order.id });
    });
  } catch (error) {

    res
      .status(500)
      .json({ error: "Error while creating Razorpay payment", details: error });
  }
};


const razorpay = async (req, res) => {
  console.log("Razorpay payment processing...");

  try {
    const {
      addressId,
      cartId,
      paymentMethod,
      amountTotal,
      offerDiscount,
      discountAmount,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      deliveryCharge
    } = req.body;


    const userId = req.session.user._id;
    const payment = paymentMethod;

    const userCartData = await cartDatabase.findOne({ user: userId, _id: cartId }).populate("items.productId");

    if (!userCartData) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const orderedItems = userCartData.items.map((item) => ({
      productId: item.productId._id,
      productname: item.productId.product_name,
      productimages: item.productId.images,
      price: item.productId.price,
      finalPrice: item.productId.finalPrice || item.productId.price, // Use price as fallback
      quantity: item.quantity,
      status: "Pending",
      returned: false,
    }));


    const totalAmount = userCartData.totalAmount;

    const amountTotalValue = parseFloat(amountTotal.replace(/[^0-9.]/g, ""));
    const offerDiscountValue = parseFloat(offerDiscount.replace(/[^0-9.]/g, ""));
    const discountAmountValue = parseFloat(discountAmount.replace(/[^0-9.]/g, ""));
    const deliveryChargeValue = parseFloat(deliveryCharge.replace(/[^0-9.]/g, ""));

    if (isNaN(amountTotalValue) || isNaN(offerDiscountValue) || isNaN(discountAmountValue) || isNaN(deliveryChargeValue)) {
      return res.status(400).json({ error: "Invalid numeric value" });
    }

    const newOrder = new OrderDatabase({
      user_id: userId,
      orderedItems: orderedItems,
      status: "Pending",
      returned: false,
      paymentStatus: "Completed",
      shippingAddress: addressId,
      paymentMethod: payment,
      totalAmount: totalAmount,
      finalAmount: amountTotalValue,
      deliveryCharge: deliveryChargeValue,
      couponDiscount: discountAmountValue || 0,
      offerDiscount: offerDiscountValue || 0,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    });

    await newOrder.save();
    await cartDatabase.findOneAndDelete({ user: userId, _id: cartId });

    await Promise.all(userCartData.items.map(async (product) => {
      await productDatabase.findByIdAndUpdate(product.productId, {
        $inc: { stock: -product.quantity }
      });
    }));

    res.status(200).json({ message: "Order placed successfully", orderId: newOrder._id, redirectUrl: `/order/${newOrder._id}/invoice` });
  } catch (error) {

    res.status(500).json({ error: "Error placing order" });
  }
};



// In the server-side orderController.js
const handleFailedPayment = async (req, res) => {
  try {
    const { cartId, selectedAddressId, paymentMethod, amountTotal, razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature } = req.body;
    const userId = req.session.user._id;


    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Find the cart for the user
    const userCartData = await cartDatabase
    .findOne({ user: userId, _id: cartId })
    .populate("items.productId");

  if (!userCartData) {
    return res.status(404).json({ message: "Cart not found" });
  }

  const orderedItems = userCartData.items.map((item) => ({
    productId: item.productId._id,
    productname: item.productId.product_name,
    productimages: item.productId.images,
    price: item.productId.price,
    finalPrice:item.productId.finalPrice,
    quantity: item.quantity,
    status: "Pending",
    returned: false,
  }));

  const totalAmount = userCartData.totalAmount;

  const amountTotalString = amountTotal.replace(/[^0-9.]/g, "");
  const finalAmount = parseFloat(amountTotalString);

  if (isNaN(finalAmount)) {
    return res.status(400).json({ error: "Invalid final amount" });
  }

  if (paymentMethod === "COD" && totalAmount > 1000) {
    return res.status(400).json({ error: "COD payment is not allowed for orders over Rs. 1000" });
  }

  let deliveryCharge = 0;
  if (totalAmount > 500) {
    deliveryCharge = 50;
  }

  if (paymentMethod === "wallet") {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet || wallet.balance < finalAmount + deliveryCharge) {
      return res.status(400).json({ error: "Insufficient wallet balance" });
    }

    // Deduct amount from wallet
    wallet.balance -= finalAmount + deliveryCharge;
    wallet.transactions.push({
      type: "withdrawal",
      amount: finalAmount + deliveryCharge,
      timestamp: new Date(),
      description: "Order payment",
    });
    await wallet.save();
  }

  const newOrder = new OrderDatabase({
    user_id: userId,
    orderedItems: orderedItems,
    status: "Pending",
    returned: false,
    paymentStatus: "failure",
    shippingAddress: selectedAddressId,
    paymentMethod: paymentMethod,
    totalAmount: totalAmount,
    finalAmount: finalAmount + deliveryCharge,
    deliveryCharge: deliveryCharge,
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
  });
  await newOrder.save();
  await cartDatabase.findOneAndDelete({ user: userId, _id: cartId });

  await Promise.all(
    userCartData.items.map(async (product) => {
      await productDatabase.findByIdAndUpdate(product.productId, {
        $inc: { stock: -product.quantity },
      });
    })
  );
    // Respond with success:true to indicate successful handling
    res.status(200).json({ success: true });
  } catch (error) {

    res.status(500).json({ message: "Internal Server Error" });
  }
};




const changeStatus=async(req,res)=>{
const {orderId} = req.body

console.log(orderId,"orderId");

const order = await OrderDatabase.findById(orderId);
if (!order) {
  return res.status(404).json({ message: "Order not found" });
}

order.paymentStatus="Completed"
await order.save();
res.status(200).json({ message: "Order successfully" });
}

const getCancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await OrderDatabase.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status === "Cancelled") {
      return res.status(400).json({ message: "Order is already cancelled" });
    }

    // If payment was completed, refund the amount to the user's wallet
    if (order.paymentStatus === "Completed") {
      const userId = order.user_id;
      let wallet = await Wallet.findOne({ user: userId });
    
      if (!wallet) {
        wallet = new Wallet({
          user: userId,
          balance: 0,
          transactions: [],
        });
      }
    
      wallet.balance += order.finalAmount;
      wallet.transactions.push({
        type: "Refunded",
        amount: order.finalAmount,
        timestamp: new Date(),
        description: "Order cancellation refund",
      });
      await wallet.save();
    }
    // Update the stock for each ordered item
    for (const item of order.orderedItems) {
      await productDatabase.findByIdAndUpdate(item.productId, {
        $inc: { stock: item.quantity },
      });
    }

    order.status = "Cancelled";
    order.paymentStatus = "Refunded"; // Update the payment status
    await order.save();

    res.status(200).json({ success: true, message: "Order cancelled successfully" });
  } catch (error) {

    res.status(500).json({ success: false, message: "Error cancelling order" });
  }
};




const postReturnOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await OrderDatabase.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status === "Returned") {
      return res.status(400).json({ message: "Order is already returned" });
    }

    // If payment was completed, refund the amount to the user's wallet
    if (order.paymentStatus === "Completed") {
      const userId = order.user_id;
      let wallet = await Wallet.findOne({ user: userId });
    
      if (!wallet) {
        wallet = new Wallet({
          user: userId,
          balance: 0,
          transactions: [],
        });
      }
    
      wallet.balance += order.finalAmount;
      wallet.transactions.push({
        type: "Refunded",
        amount: order.finalAmount,
        timestamp: new Date(),
        description: "Order return refund",
      });
      await wallet.save();
    }

    // Update the stock for each ordered item
    for (const item of order.orderedItems) {
      await productDatabase.findByIdAndUpdate(item.productId, {
        $inc: { stock: item.quantity },
      });
    }

    order.status = "Returned";
    order.paymentStatus = "Refunded"; // Update the payment status
    await order.save();

    res.status(200).json({ success: true, message: "Order returned successfully" });
  } catch (error) {

    res.status(500).json({ success: false, message: "Error returning order" });
  }
};

// New route to get wallet transactions
// New route to get wallet transactions
const getWalletTransactions = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      return res
        .status(404)
        .json({ success: false, message: "Wallet not found" });
    }

    res.json({
      success: true,
      balance: wallet.balance,
      transactions: wallet.transactions,
    });
  } catch (error) {

    res
      .status(500)
      .json({ success: false, message: "Error fetching wallet transactions" });
  }
};



const getWalletBalance = async (req, res) => {
  try {
    // Get user ID from session or request parameters
    const userId = req.session.user._id; // Adjust this according to your session implementation

    // Find the wallet balance for the user
    const wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found for the user" });
    }

    // Send wallet balance in response
    res.json({ balance: wallet.balance });
  } catch (error) {

    res.status(500).json({ error: "Internal Server Error" });
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await OrderDatabase.findById(orderId)
      .populate({
        path: 'orderedItems.productId',
        select: 'product_name images',
      })
      .populate({
        path: 'shippingAddress',
        populate: { path: 'user', model: 'UserDatabase' }
      });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Import the required modules
    const fs = require('fs');
    const path = require('path');
    const PDFDocument = require('pdfkit');

    // Create a new PDF document
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Create the 'invoices' directory if it doesn't exist
    const invoicesDir = path.join(__dirname, 'public', 'invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    // Pipe the PDF document to a writable stream
    const fileName = `invoice_${orderId}.pdf`;
    const filePath = path.join(invoicesDir, fileName);
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Set font and styles
    doc.font('Helvetica-Bold');
    doc.fillColor('#333333');

    // Add title
    doc.fontSize(20).text('Order Invoice', { align: 'center' });
    doc.moveDown();

    // Add company details
    doc.font('Helvetica');
    doc.fontSize(10).text('Sold By: ShoesKampany Private Limited', { align: 'left' });
    doc.text('Ship-from Address: Buildings Alyssa, Begonia & Clover, Embassy Tech Village, Outer Ring Road, Devarabeesanahalli Village,', { align: 'left' });
    doc.text('Bengaluru, Bengaluru, Karnataka, IN - 560103', { align: 'left' });
    doc.text('CIN: U51109KA2012PTC066107', { align: 'left' });
    doc.text('GSTIN: 29AACCF0683K1ZD', { align: 'left' });
    doc.moveDown();

    // Add order details
    doc.fontSize(10).text(`Order ID: ${order._id}`, { align: 'left' });
    doc.text(`Order Date: ${new Date(order.orderDate).toLocaleDateString()}`, { align: 'left' });
    doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`, { align: 'left' });
    doc.text(`Payment Method: ${order.paymentMethod}`, { align: 'left' });
    doc.text(`Payment Status: ${order.paymentStatus}`, { align: 'left' });
    doc.moveDown();

    // Add billing address
    doc.fontSize(10).text(`Billing Address:`, { align: 'left', underline: true });
    doc.text(`Name: ${order.shippingAddress.user.firstname} ${order.shippingAddress.user.lastname}`, { align: 'left' });
    doc.text(`Address: ${order.shippingAddress.address}`, { align: 'left' });
    doc.text(`District: ${order.shippingAddress.district}`, { align: 'left' });
    doc.text(`State: ${order.shippingAddress.state}`, { align: 'left' });
    doc.text(`Pincode: ${order.shippingAddress.pincode}`, { align: 'left' });
    doc.moveDown();

    // Table configuration
const tableTop = doc.y;
const tableLeft = 50;
const tableWidth = 500;
const rowHeight = 20;
const columns = [
  { name: 'Description', width: 180 },
  { name: 'Qty', width: 40, align: 'center' },
  { name: 'Price', width: 70, align: 'right' },
  { name: 'Offer Price', width: 70, align: 'right' },
  { name: 'Discount', width: 70, align: 'right' },
  { name: 'Final Price', width: 70, align: 'right' }
];

// Draw table header
doc.font('Helvetica-Bold');
doc.fontSize(10);
doc.rect(tableLeft, tableTop, tableWidth, rowHeight).stroke();
let currentX = tableLeft;
columns.forEach(column => {
  doc.text(column.name, currentX + 5, tableTop + 5, {
    width: column.width - 10,
    align: column.align || 'left'
  });
  currentX += column.width;
});

// Draw table rows
doc.font('Helvetica');
let currentY = tableTop + rowHeight;
let subtotal = 0;
let totalDiscount = 0;

order.orderedItems.forEach(item => {
  doc.rect(tableLeft, currentY, tableWidth, rowHeight).stroke();
  currentX = tableLeft;
  
  const originalPrice = item.price;
  const finalPrice = item.finalPrice;
  const quantity = item.quantity;
  const totalOriginalPrice = originalPrice * quantity;
  const totalFinalPrice = finalPrice * quantity;
  const discount = totalOriginalPrice - totalFinalPrice;
  
  subtotal += totalFinalPrice;
  totalDiscount += discount;

  columns.forEach(column => {
    let value = '';
    switch(column.name) {
      case 'Description': value = item.productname; break;
      case 'Qty': value = quantity.toString(); break;
      case 'Price': value = `Rs:${originalPrice.toFixed(2)}`; break;
      case 'Offer Price': value = `Rs:${finalPrice.toFixed(2)}`; break;
      case 'Discount': value = `Rs:${discount.toFixed(2)}`; break;
      case 'Final Price': value = `Rs:${totalFinalPrice.toFixed(2)}`; break;
    }
    doc.text(value, currentX + 5, currentY + 5, {
      width: column.width - 10,
      align: column.align || 'left'
    });
    currentX += column.width;
  });
  currentY += rowHeight;
});

// Add subtotal
currentY += rowHeight;
doc.font('Helvetica-Bold');
doc.text('Subtotal:', tableLeft, currentY);
doc.text(`Rs:${subtotal.toFixed(2)}`, tableLeft + tableWidth - 70, currentY, { width: 65, align: 'right' });

// Add coupon discount if applicable
if (order.couponDiscount > 0) {
  currentY += rowHeight;
  doc.font('Helvetica');
  doc.text(`Coupon Discount:`, tableLeft, currentY);
  doc.text(`Rs:${order.couponDiscount.toFixed(2)}`, tableLeft + tableWidth - 70, currentY, { width: 65, align: 'right' });
  totalDiscount += order.couponDiscount;
}

// Add offer discount
if (order.offerDiscount > 0) {
  currentY += rowHeight;
  doc.text('Offer Discount:', tableLeft, currentY);
  doc.text(`Rs:${order.offerDiscount.toFixed(2)}`, tableLeft + tableWidth - 70, currentY, { width: 65, align: 'right' });
  totalDiscount += order.offerDiscount;
}

// Add delivery charge
if (order.deliveryCharge > 0) {
  currentY += rowHeight;
  doc.text('Delivery Charge:', tableLeft, currentY);
  doc.text(`Rs:${order.deliveryCharge.toFixed(2)}`, tableLeft + tableWidth - 70, currentY, { width: 65, align: 'right' });
}

// Add total discount
currentY += rowHeight;
doc.font('Helvetica-Bold');
doc.text('Total Discount:', tableLeft, currentY);
doc.text(`Rs:${totalDiscount.toFixed(2)}`, tableLeft + tableWidth - 70, currentY, { width: 65, align: 'right' });

// Add grand total
currentY += rowHeight;
doc.fontSize(12);
doc.text('Grand Total:', tableLeft, currentY);
doc.text(`Rs:${order.finalAmount.toFixed(2)}`, tableLeft + tableWidth - 70, currentY, { width: 65, align: 'right' });
    // Footer
    // Add a line separator
doc.moveDown(2);
doc.moveTo(50, doc.y)
   .lineTo(550, doc.y)
   .stroke();

// Footer
const bottomOfPage = doc.page.height - 50;

// Add a line separator
doc.moveTo(50, bottomOfPage - 40)
   .lineTo(550, bottomOfPage - 40)
   .stroke();

// Company name
doc.font('Helvetica-Bold');
doc.fontSize(14).text('ShoesKampany Private Limited', 50, bottomOfPage - 35, { 
  width: 500, 
  align: 'center'
});

// Authorized Signatory
doc.font('Helvetica');
doc.fontSize(10).text('Authorized Signatory', 450, bottomOfPage - 15, { 
  width: 100, 
  align: 'center'
});

// Add a line for signature
doc.moveTo(450, bottomOfPage - 20)
   .lineTo(550, bottomOfPage - 20)
   .stroke();

    // Finalize the PDF document
    doc.end();

    // Send the PDF file as a response
    writeStream.on('finish', () => {
      res.download(filePath, fileName, (err) => {
        if (err) {

          res.status(500).json({ error: 'Error downloading invoice' });
        } else {
          // Delete the PDF file after it has been downloaded
          fs.unlinkSync(filePath);
        }
      });
    });
  } catch (error) {

    res.status(500).json({ error: 'Error generating invoice' });
  }
};

const handleRetryPayment = async (req, res) => {
  try {


    const { totalPrice } = req.body;

    // Convert total price to an integer representing paise
    const totalAmountInPaise = Math.round(Number(totalPrice) * 100);

    const instance = new Razorpay({
      key_id: "rzp_test_OYzzRLNBCqZfkG",
      key_secret: "h2eDgR2HYioEqKWp9tYzfQNO",
    });

    const options = {
      amount: totalAmountInPaise, // Use the integer amount
      currency: "INR",
      receipt: "receipt#1",
    };


    instance.orders.create(options, (err, order) => {
      if (err) {

        return res
          .status(500)
          .json({ error: "Error creating order", details: err });
      }


      res.status(200).json({ orderId: order.id });
    });
  } catch (error) {
  
    res
      .status(500)
      .json({ error: "Error while creating Razorpay payment", details: error });
  }
};

const addAddressController = async (req, res) => {
  const userId = req.session.user._id;



  try {
    const name = req.body.name;
    const mobile = req.body.mobile;
    const address = req.body.address;
    const district = req.body.district;
    const state = req.body.state;
    let pincode = req.body.pincode;
    const landmark = req.body.landmark;

    // Remove spaces from pincode before validation
    pincode = pincode.replace(/\s/g, "");

    // Check if any of the required fields are missing
    if (!name || !mobile || !address || !district || !state || !pincode) {
      return res.status(400).json({ errors: ["All fields are required"] });
    }

    // Validate mobile number to ensure it contains exactly 10 digits
    if (!/^[\d]{10}$/.test(mobile)) {
      return res.status(400).json({ errors: ["Mobile number must be 10 digits"] });
    }

    // Validate pincode to ensure it contains exactly 6 digits
    if (!/^[\d]{6}$/.test(pincode)) {
      return res.status(400).json({ errors: ["PinCode must be 6 digits"] });
    }

    // Check if the address already exists
    const checkExists = await addressDatabase.findOne({
      user: userId,
      name: name.trim(),
      mobile: mobile.trim(),
      address: address.trim(),
      district: district.trim(),
      state: state,
      pincode: pincode.trim()
    });

    if (checkExists) {
      return res.status(400).json({ errors: ["Address already exists"] });
    }

    // Create a new address if it doesn't already exist
    const newAddress = new addressDatabase({
      user: userId,
      name: name,
      mobile: mobile,
      address: address,
      district: district,
      state: state,
      pincode: pincode,
      landmark: landmark // Optional
    });

    await newAddress.save();

    return res.status(200).json({ success: true, newAddress });
  } catch (err) {
  
    return res.status(500).json({ errors: ["Server error"] });
  }
};


module.exports = {
  getCheckout,
  postOrder,
  viewOrders,
  viewOrderDetail,
  singleOrder,
  sucessPage,
  postRazorpay,
  razorpay,
  applyCoupon,
  getCancelOrder,
  postReturnOrder,
  getWalletTransactions,
  getWalletBalance,
  downloadInvoice,handleFailedPayment,handleRetryPayment,changeStatus,addAddressController
};
