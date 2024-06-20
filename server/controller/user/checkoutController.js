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
    console.log(walletBalance,"111");

    // Log the cart object to check if offerDiscount is present
    console.log("Cart object:", cart);

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
    console.log(e);
    res.status(500).send("Internal Error");
  }
};


const postOrder = async (req, res) => {
  try {
    const { addressId, cartId, paymentMethod, amountTotal, couponDiscount } = req.body;
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
      quantity: item.quantity,
      status: "Pending",
      returned: false,
    }));

    const totalAmount = userCartData.totalAmount;
    const offerDiscount = calculateOfferDiscount(userCartData.items);

    const amountTotalString = amountTotal.replace(/[^0-9.]/g, "");
    const finalAmount = parseFloat(amountTotalString);

    if (isNaN(finalAmount)) {
      return res.status(400).json({ error: "Invalid final amount" });
    }

    if (paymentMethod === "COD" && totalAmount > 1000) {
      return res.status(400).json({ error: "COD payment is not allowed for orders over Rs. 1000" });
    }

    let deliveryCharge = 0;
    if (totalAmount <= 500) {
      deliveryCharge = 50;
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
      if (wallet.balance < finalAmount + deliveryCharge) {
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
      finalAmount: finalAmount + deliveryCharge,
      deliveryCharge: deliveryCharge,
      couponDiscount: couponDiscount || 0,
      offerDiscount: offerDiscount || 0,
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
      couponDiscount,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body;
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

    // Calculate offer discount for the entire cart
    const offerDiscount = calculateOfferDiscount(userCartData.items);

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
      paymentStatus: paymentMethod === "RazorPay" ? "Completed" : "Pending",
      shippingAddress: AddressId,
      paymentMethod: payment,
      totalAmount: totalAmount,
      finalAmount: finalAmount, 
      deliveryCharge: deliveryCharge,
      couponDiscount: couponDiscount || 0,
      offerDiscount: offerDiscount || 0,
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

    res.status(200).json({ message: "Order placed successfully", orderId: newOrder._id, redirectUrl: `/order/${newOrder._id}/invoice` });
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
    console.error("Error cancelling order:", error);
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
    console.error("Error returning order:", error);
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
    const doc = new PDFDocument({ margin: 50 });

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
    doc.font('Helvetica');
    doc.fillColor('#333333');

    // Add company details
    doc.fontSize(18).text('Shoes Kampnay', { align: 'center', bold: true });
    doc.fontSize(12).text('Address: Kochi, India', { align: 'center' });
    doc.text('Phone: 8281935725', { align: 'center' });
    doc.text('Email: shoesKampnay@gmail.com', { align: 'center' });
    doc.moveDown();

    // Add invoice header
    doc.fontSize(24).text('Invoice', { align: 'center', bold: true });
    doc.moveDown();

    // Add invoice date and number
    const invoiceDate = new Date();
    const invoiceNumber = `INV-${order._id.toString().slice(-6).toUpperCase()}`;
    doc.fontSize(12).text(`Date: ${invoiceDate.toLocaleDateString()}`, { align: 'left' });
    doc.text(`Invoice Number: ${invoiceNumber}`, { align: 'right' });
    doc.moveDown();

    // Add customer name
    const customerName = order.shippingAddress.user.firstname + ' ' + order.shippingAddress.user.lastname || 'Not available';
    doc.fontSize(16).text(`Customer Name: ${customerName}`, { align: 'left', underline: true });
    doc.moveDown();

    // Add shipping address
    doc.fontSize(14).text('Shipping Address:', { align: 'left', underline: true });
    if (order.shippingAddress) {
      const address = order.shippingAddress;
      doc.fontSize(12).text(`Name: ${address.name}`);
      doc.text(`Mobile: ${address.mobile}`);
      doc.text(`Address: ${address.address}`);
      doc.text(`District: ${address.district}`);
      doc.text(`State: ${address.state}`);
      doc.text(`Pincode: ${address.pincode}`);
      doc.text(`Landmark: ${address.landmark || 'Not specified'}`);
    } else {
      doc.text('Address: Not available');
    }
    doc.moveDown();

    // Add ordered items
    doc.fontSize(14).text('Ordered Items:', { align: 'left', underline: true });
    doc.fontSize(12);
    order.orderedItems.forEach(item => {
      const itemTotal = (item.price * item.quantity).toFixed(2);
      doc.text(`- ${item.productId.product_name} x ${item.quantity} - ₹${itemTotal}`);
      // Add images if available

      
    });
    doc.moveDown();

    // Add payment method
    doc.fontSize(14).text(`Payment Method: ${order.paymentMethod}`, { align: 'left', underline: true });
    doc.moveDown();

    // Add total amount
    const finalAmount = order.finalAmount || 0;
    doc.fontSize(16).text(`Final Amount: ₹${finalAmount.toFixed(2)}`, { align: 'left', underline: true });
    doc.moveDown();

    // Add thank you message
    doc.fontSize(14).text('Thank you for your order!', { align: 'center' });
    doc.moveDown();

    // Add manager's signature
    const managerSignatureIcon = 0xf2bc; // Unicode code point for the 'user-tie' icon from Font Awesome
    doc.fontSize(18).text(String.fromCodePoint(managerSignatureIcon), { align: 'center' });
    doc.fontSize(10).text('Manager\'s Signature', { align: 'center' });
    doc.moveDown();

    // Add terms and conditions (if applicable)
    doc.fontSize(10).text('Terms and Conditions:', { align: 'center', underline: true });
    doc.text('- All sales are final.', { align: 'center' });

    // Add more terms and conditions as needed

    // Add footer
    const footerText = 'Shoes Kampnay | www.shoeskampnay.com | shoesKampnay@gmail.com';
    doc.fontSize(10).text(footerText, { align: 'center' });

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
    console.error(err.message);
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
