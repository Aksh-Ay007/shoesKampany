const mongoose=require('mongoose');
const Schema=mongoose.Schema;

const cartSchema=new Schema({
    user:{
        type:Schema.Types.ObjectId,
        ref:'userdb',
        required:true
    },
    items:[{
        productId:{
            type: Schema.Types.ObjectId,
            ref:'productDatabase',
            required:true
        },
        quantity:{
            type:Number
           
        }
    }],

    totalAmount:{
        type:Number
    },
  
},{timestamps:true});


const cartDatabase=mongoose.model('cartDatabase',cartSchema)

module.exports=cartDatabase;