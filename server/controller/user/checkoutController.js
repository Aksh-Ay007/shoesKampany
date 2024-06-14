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

const applyOffer = async (product, couponDiscount = 0) => {
    const productOffer = await offerDatabase.findOne({
        product_name: product._id,
        unlist: true,
    });
    const categoryOffer = await offerDatabase.findOne({
        category_name: product.category,
        unlist: true,
    });

    if (productOffer && typeof productOffer.discount_Amount === "number") {
        product.offerPrice = Math.round(
            product.price - product.price * (productOffer.discount_Amount / 100)
        );
        product.offerDiscount = Math.round(product.price * (productOffer.discount_Amount / 100));
    } else if (
        categoryOffer &&
        typeof categoryOffer.discount_Amount === "number"
    ) {
        product.offerPrice = Math.round(
            product.price - product.price * (categoryOffer.discount_Amount / 100)
        );
        product.offerDiscount = Math.round(product.price * (categoryOffer.discount_Amount / 100));
    } else {
        product.offerPrice = null;
        product.offerDiscount = 0;
    }

    // Subtract coupon discount from offer price if available
    if (product.offerPrice !== null && couponDiscount > 0) {
        product.finalPrice = product.offerPrice - couponDiscount;
    } else if (couponDiscount > 0) {
        product.finalPrice = product.price - couponDiscount;
    } else {
        product.finalPrice = product.offerPrice || product.price;
    }

    product.couponDiscount = couponDiscount;
    
    return product;
};


// Function to calculate offer discount for the entire cart
const calculateOfferDiscount = (items) => {
  let totalOfferDiscount = 0;
  items.forEach((item) => {
    if (item.productId.offerPrice) {
      totalOfferDiscount +=
        (item.productId.price - item.productId.offerPrice) * item.quantity;
    }
  });
  return totalOfferDiscount;
};

const getCheckout = async (req, res) => {
  try {
    if (!req.session.user || !req.session.user._id) {
      return res.status(401).send("Unauthorized: Please log in first.");
    }

    const userId = req.session.user._id;
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
        errorMessage: "",
        coupon: [],
        appliedCoupon: null,
      });
      return;
    }

    const availableCoupons = await couponDatabase.find({
      minimum_Amount: { $lte: cart.totalAmount },
      maximum_Amount: { $gte: cart.totalAmount },
    });

    // Apply offer prices to cart items and filter out null productIds
    cart.items = await Promise.all(
      cart.items.map(async (item) => {
        if (item.productId) {
          item.productId = await applyOffer(item.productId);
          return item;
        }
      })
    );

    // Remove any null items
    cart.items = cart.items.filter(item => item.productId);

    // Calculate offer discount for the entire cart
    cart.offerDiscount = calculateOfferDiscount(cart.items);

    // Log the cart object to check if offerDiscount is present
    console.log("Cart object:", cart);

    res.render("checkoutt", {
      addresses,
      user,
      cart,
      errorMessage: "",
      coupon: availableCoupons,
      appliedCoupon: null,
    });
  } catch (e) {
    console.log(e);
    res.status(500).send("Internal Error");
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
    console.error(error);
    res.status(500).json({ message: "Error applying coupon" });
  }
};

const sucessPage = (req, res) => {
  try {
    return res.render("orderplaced");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error rendering order placed page");
  }
};

const postOrder = async (req, res) => {
  try {
    const { addressId, cartId, paymentMethod, amountTotal } = req.body;
    console.log("hwew");
    const userId = req.session.user._id;
    const AddressId = addressId;
    const payment = paymentMethod;

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
      quantity: item.quantity,
      status: "Pending",
      returned: false,
    }));

    const totalAmount = userCartData.totalAmount;

    const amountTotalString = amountTotal.replace(/[^0-9.]/g, "");
    const finalAmount = parseFloat(amountTotalString);
   console.log("paymentMethod",paymentMethod,isNaN(finalAmount));
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

    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet || wallet.balance < finalAmount + deliveryCharge) {
        return res.status(400).json({ error: "Insufficient wallet balance" });
      }

      // Deduct amount from wallet
      console.log(" wallet.balance ", wallet.balance );
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
      paymentStatus: paymentMethod === "wallet" ? "Completed" : "Pending",
      shippingAddress: AddressId,
      paymentMethod: payment,
      totalAmount: totalAmount,
      finalAmount: finalAmount + deliveryCharge,
      deliveryCharge: deliveryCharge,
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
    console.error("Error placing order:", error);
    res.status(500).json({ error: "Error placing order" });
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
    console.error(error);
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
    console.log(e.toString());
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
    const order = await OrderDatabase.findById(orderId).populate(
      "shippingAddress"
    );
    if (!order) {
      return res.status(404).send("No order found");
    }
    res.render("orderDetail", { order, name, orders: [order] });
  } catch (e) {
    console.log(e.toString());
    res.status(500).send("Internal Server Error");
  }
};

const postRazorpay = async (req, res) => {
  try {
    console.log("Request Body:", req.body);

    const { totalPrice } = req.body;

    // Convert total price to an integer representing paise
    const totalAmountInPaise = Math.round(Number(totalPrice) * 100);
    console.log("Total Amount in Paise:", totalAmountInPaise);

    const instance = new Razorpay({
      key_id: "rzp_test_OYzzRLNBCqZfkG",
      key_secret: "h2eDgR2HYioEqKWp9tYzfQNO",
    });

    const options = {
      amount: totalAmountInPaise, // Use the integer amount
      currency: "INR",
      receipt: "receipt#1",
    };
    console.log("Options for Creating Order:", options);

    instance.orders.create(options, (err, order) => {
      if (err) {
        console.error("Error creating order:", err);
        return res
          .status(500)
          .json({ error: "Error creating order", details: err });
      }

      console.log("Order created successfully:", order);
      res.status(200).json({ orderId: order.id });
    });
  } catch (error) {
    console.error("Error in postRazorpay:", error);
    res
      .status(500)
      .json({ error: "Error while creating Razorpay payment", details: error });
  }
};

const razorpay = async (req, res) => {
  try {
    const {
      addressId,
      cartId,
      paymentMethod,
      amountTotal,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body;
    const userId = req.session.user._id;
    const AddressId = addressId;
    const payment = paymentMethod;

    console.log(">>>>");

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
      paymentStatus: paymentMethod === "RazorPay" ? "Completed" : "Pending", // Set paymentStatus to "Completed" for Razorpay
      shippingAddress: AddressId,
      paymentMethod: payment,
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

    res.status(200).json({ message: "Order placed successfully", orderId: newOrder._id });
  } catch (error) {
    console.error("Error placing order:", error);
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
console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
    console.log("req.bbody",req.body);

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
    console.error("Error in handleFailedPayment function:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};



const getCancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await OrderDatabase.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status === "Cancelled") {
      return res.status(400).json({ message: "Order is already cancelled" });
    }

    order.status = "Cancelled";
    await order.save();

    res.status(200).json({ message: "Order cancelled successfully" });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ message: "Error cancelling order" });
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

    order.status = "Returned";
    await order.save();

    res.status(200).json({ message: "Order returned successfully" });
  } catch (error) {
    console.error("Error returning order:", error);
    res.status(500).json({ message: "Error returning order" });
  }
};

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
    console.log("Error in getWalletTransactions:", error);
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
    console.error("Error fetching wallet balance:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await OrderDatabase.findById(orderId)
      .populate({
        path: 'orderedItems.productId',
        select: 'product_name images', // Select only necessary fields from product database
      })
      .populate({
        path: 'shippingAddress',
        populate: { path: 'user', model: 'UserDatabase' } // Populate the 'user' field with the 'UserDatabase' model
      });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Import the required modules
    const fs = require('fs');
    const path = require('path');
    const PDFDocument = require('pdfkit');

    // Create a new PDF document
    const doc = new PDFDocument({ margins: { top: 30, bottom: 30, left: 30, right: 30 } });

    // Create the 'invoices' directory if it doesn't exist
    const invoicesDir = path.join(__dirname, 'public', 'invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    // Pipe the PDF document to a writable stream
    const fileName = `invoice_${orderId}.pdf`;
    const filePath = path.join(invoicesDir, fileName); // Path where the PDF will be saved
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Set font and styles
    doc.font('Helvetica-Bold');
    doc.fillColor('#333333');

    // Add invoice header
    doc.fontSize(24).text('Invoice', { align: 'center' });
    doc.moveDown();

    // Add customer name
    const customerName = order.shippingAddress.user.firstname + ' ' + order.shippingAddress.user.lastname || 'Not available';
    doc.fontSize(16).text(`Customer Name: ${customerName}`, { align: 'center', underline: true });
    doc.moveDown();

    // Add shipping address
    doc.fontSize(16).text('Shipping Address:', { align: 'center', underline: true });
    doc.font('Helvetica');
    if (order.shippingAddress) {
      const address = order.shippingAddress;
      doc.text(`Name: ${address.name}`);
      doc.text(`Mobile: ${address.mobile}`);
      doc.text(`Address: ${address.address}`);
      doc.text(`District: ${address.district}`);
      doc.text(`State: ${address.state}`);
      doc.text(`Pincode: ${address.pincode}`);
      doc.text(`Landmark: ${address.landmark || 'Not specified'}`);
    } else {
      doc.fontSize(12).text('Address: Not available');
    }
    doc.moveDown();

    // Add ordered items
    doc.fontSize(16).text('Ordered Items:', { align: 'center', underline: true });
    doc.font('Helvetica');
    order.orderedItems.forEach(item => {
      doc.fontSize(12).text(`- ${item.productId.product_name} x ${item.quantity} - $${(item.price * item.quantity).toFixed(2)}`);
      // Add images if available
      if (item.productId.images && item.productId.images.length > 0) {
        item.productId.images.forEach(image => {
          doc.image(image, { width: 100, align: 'center' });
          doc.moveDown();
        });
      }
    });
    doc.moveDown();

    // Add payment method
    doc.fontSize(16).text(`Payment Method: ${order.paymentMethod}`, { align: 'center', underline: true });
    doc.moveDown();

    // Add total amount
    const finalAmount = order.finalAmount || 0;
    doc.fontSize(16).text(`Final Amount: $${finalAmount.toFixed(2)}`, { align: 'center', underline: true });
    doc.moveDown();

    // Add thank you message
    doc.fontSize(18).text('Thank you for your order!', { align: 'center' });

    // Finalize the PDF document
    doc.end();

    // Send the PDF file as a response
    writeStream.on('finish', () => {
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('Error downloading invoice:', err);
          res.status(500).json({ error: 'Error downloading invoice' });
        } else {
          // Delete the PDF file after it has been downloaded
          fs.unlinkSync(filePath);
        }
      });
    });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Error generating invoice' });
  }
};



const handleRetryPayment = async (req, res) => {
  try {
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    const order = await OrderDatabase.findById(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify the payment signature with Razorpay
    const instance = new Razorpay({
      key_id: 'YOUR_RAZORPAY_KEY_ID',
      key_secret: 'YOUR_RAZORPAY_KEY_SECRET',
    });

    const signatureValid = instance.validatePaymentSignature({
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (signatureValid) {
      order.paymentStatus = 'Completed';
      await order.save();
      return res.status(200).json({ message: 'Payment retried successfully' });
    } else {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error('Error handling retry payment:', error);
    res.status(500).json({ error: 'Error handling retry payment' });
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
  downloadInvoice,handleFailedPayment,handleRetryPayment
};
