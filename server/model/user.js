const mongoose = require("mongoose");

// Declare the Schema of the Mongo model
var userSchema = new mongoose.Schema({
  firstname: {
    type: String,
  },
  lastname: {
    type: String,
  },
  email: {
    type: String,
  },
  password: {
    type: String,
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  refCode:{
    type:String,
  },
  googleID:{
    type:String,
  }
});

//Export the model
module.exports = mongoose.model("UserDatabase", userSchema);
