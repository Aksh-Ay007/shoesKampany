const mongoose=require('mongoose');

var categorySchema=new mongoose.Schema({


categoryName:{

    type:String,
    require:true
},

list:{

type:String,
enum:["listed","unlisted"],
default:"listed"
},

discription:{

    type:String,
}




})

const categoryDatabase=mongoose.model('categorydb',categorySchema);

module.exports=categoryDatabase;
