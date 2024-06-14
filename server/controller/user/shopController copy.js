const userDatabase = require("../../model/user");
const productDatabase = require("../../model/productsModel");
const category=require('../../model/categoryModel')
const cartDatabase=require('../../model/cartModel')



const getShop = async(req, res) => {
    // Assuming you determine the value of isUser based on the session or authentication status
    const isUser = req.session.user !== undefined;

    try {

      const catagoryId=req.query.category
  
     
      const categories = await category.find();
      const cart=await cartDatabase.findOne({user:req.session.user._id}).populate('items.productId');
     
      let selectedProduct;
      if(catagoryId){
        selectedProduct =await productDatabase.find({category:catagoryId,list: 'listed'})
      }else{
        selectedProduct=await productDatabase.find()
      }

      let selectedCategory="All"
      const selectedSort =  '{"_id": 1}';

      res.render('shop', {selectedCategory, isUser,categories,selectedSort,selectedProduct,cart});
  
    } 
  
    catch (error) {
      
    // Handle error
    res.status(500).send("Internal Server Error");

    }


  };


 module.exports={getShop};