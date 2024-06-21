// controllers/reviewController.js
const OrderDatabase = require('../../model/orderModal');
const ratingDatabase = require('../../model/ratingModel');

const submitReview = async (req, res) => {
  try {
    const { orderId, rating, review } = req.body;
    console.log(req.body,"fdgdf");
    const userId = req.session.user._id;

    const order = await OrderDatabase.findById(orderId);
    if (!order || order.status !== 'Delivered' || order.isReviewed) {
      return res.status(400).json({ message: 'Invalid order or already reviewed' });
    }

    const newReview = new ratingDatabase({
      product: order.orderedItems[0].productId, // Assuming single product orders
      user: userId,
      rating: parseInt(rating),
      review: review
    });

    await newReview.save();

    order.isReviewed = true;
    await order.save();

    res.status(200).json({ message: 'Review submitted successfully' });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ message: 'Error submitting review' });
  }
};

module.exports={submitReview}