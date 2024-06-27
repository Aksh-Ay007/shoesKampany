// controllers/reviewController.js
const OrderDatabase = require('../../model/orderModal');
const ratingDatabase = require('../../model/ratingModel');
const ProductDatabase=require("../../model/productsModel")
const mongoose = require("mongoose");
const submitReview = async (req, res) => {
  try {
    const { orderId, productId, rating, review } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: 'Invalid product ID or order ID' });
    }

    const order = await OrderDatabase.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const product = await ProductDatabase.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if the user has already reviewed this product
    const existingReview = await ratingDatabase.findOne({ product: productId, user: req.session.user._id });
    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this product', productId });
    }

    const newReview = new ratingDatabase({
      order: orderId,
      product: productId,
      user: req.session.user._id,
      rating: parseInt(rating),
      review
    });
    await newReview.save();

    // Update the isReviewed flag in the order's orderedItems array
    const orderedItemIndex = order.orderedItems.findIndex(item => item.productId.toString() === productId);
    if (orderedItemIndex !== -1) {
      order.orderedItems[orderedItemIndex].isReviewed = true;
      await order.save();
    }

    res.json({ message: 'Review submitted successfully', productId });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ message: 'Error submitting review', error: error.message });
  }
};



const editReview = async (req, res) => {
  const { rating, review } = req.body;
  const reviewId = req.params.reviewId;
  const userId = req.session.user?._id; // Use optional chaining

  try {
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ message: 'Invalid review ID' });
    }

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const existingReview = await ratingDatabase.findById(reviewId);
    if (!existingReview) {
      return res.status(404).json({ message: 'Review not found' });
    }

    if (existingReview.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You are not authorized to edit this review' });
    }

    existingReview.rating = parseInt(rating);
    existingReview.review = review;

    const updatedReview = await existingReview.save();

    res.status(200).json({ message: 'Review updated successfully', review: updatedReview });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({ message: 'Error updating review', error: error.message });
  }
};

module.exports={submitReview,editReview}