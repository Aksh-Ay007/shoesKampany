const userDatabase=require("../model/user")
const productDatabase=require("../model/productsModel");


exports.verifyAdmin=async(req,res,next)=>{
    if(req.session.admin){
        next();
    }else{
        res.redirect('/admin/adminlogin')
    }

}

