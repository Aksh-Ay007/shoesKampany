const mongoose = require('mongoose');
const { Schema } = mongoose;

const ratingSchema = new mongoose.Schema({
  product: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: "productDatabase" 
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserDatabase" 
  },
  rating: {
    type: Number, 
    min: 0,      
    max: 5
  },
  review:{
    type: String 
  }
});

const ratingModel = mongoose.model("rating", ratingSchema);
module.exports=ratingModel;