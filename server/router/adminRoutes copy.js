
const express=require('express')

const route=express.Router();
const productController=require('../controller/admin/productController');
const categoryController=require('../controller/admin/categoryController');

const userController=require('../controller/admin/userController')
const adminController=require('../controller/admin/adminController')
const dashBoardController=require('../controller/admin/dashBoardController')
const adminorderController=require("../controller/admin/adminorderController")
const reportController=require('../controller/admin/reportController')
const offerController=require("../controller/admin/offerController")

const couponController=require("../controller/admin/couponController")
const multer=require('multer')
const path = require('path');
const check=require("../middleware/check")




const storage=multer.diskStorage({
    destination:'uploads/',
    filename:function (req,file,cb){
        const uniqueSuffix= Date.now()+'-'+Math.round(Math.random() * 1E9);
        const fileExtension= path.extname(file.originalname);
        cb(null,file.fieldname+'-'+ uniqueSuffix + fileExtension);

    }
});
const upload=multer({storage:storage});



//adminlogin

route.get('/adminlogin',adminController.getAdminLogin)

route.post('/admin', adminController.postAdminLogin)

route.get('/adminLogout', adminController.adminLogout)

route.get('/dashboard',check.verifyAdmin,dashBoardController.getDashboard)




//category


route.get('/category',categoryController.list)
route.get('/addcategory',categoryController.get_cat)
route.post('/addcategories',categoryController.add_cat)
route.get('/editcategory/:id',categoryController.getEdit)
route.post('/editcategory/:id',categoryController.postEdit);
route.delete('/category-delete/:id',categoryController.deleteCategory)
route.get('/list',categoryController.blockCategory)





//products
// route.get('/products', productController.list)
// route.get('/productedit/:id',productController.getproductEdit)
// route.post('/productedit/:id',upload.array('images',4),productController.postproductEdit)
// route.get('/addproduct',productController.addproducts)
// route.post('/multproduct',upload.array('images',4),productController.createproduct)
// route.get('/deleteProduct/:id',productController.productDelete)
// route.delete('/productDelete/:id',productController.productDelete)
// route.get('/productlist',productController.block)
// route.get('/deleteSingleImage/:index/:id',productController.getDeleteSingleImage);
route.get('/products', productController.list);
route.get('/productedit/:id', productController.getproductEdit);
route.post('/productedit/:id', upload.array('images', 4), productController.postproductEdit);
route.get('/addproduct', productController.addproducts);
route.post('/multproduct', upload.array('images', 4), productController.createproduct);
route.get('/deleteProduct/:id', productController.productDelete);
route.delete('/productDelete/:id', productController.productDelete);
route.get('/productlist', productController.block);
route.get('/deleteSingleImage/:index/:id', productController.getDeleteSingleImage);




//usercontrol 

route.get('/userside',userController.user)

route.post('/blockUser/:userId',userController.userBlock)


//ordercontroller

route.get("/viewOrders",adminorderController.viewOrders)
route.get("/singleorder/:oid",adminorderController.singleOrder)
route.get('/statusshipped/:oid', adminorderController.statusShipped);

route.get('/statusdelivered/:oid', adminorderController.statusDelivered);






//salesReport


// Change these routes
route.get('/sales-report', reportController.getSalesReports);

route.get('/generate-pdf-report', reportController.generatePDFReport);

route.get('/returned-canceled-orders', reportController.getReturnedCanceledOrders);


//couponcontroler

// route.get("/couponmanage",couponController.getCouponManage)
// route.get("/addCoupon",couponController.getAddCoupon)
// route.get('/editCoupon',couponController.geteditCoupon)

route.get('/couponmanage',couponController.getCouponManage);
route.get('/addCoupon', couponController.getAddCoupon);
route.post('/addCoupon', couponController.postAddCoupon);
route.get('/editCoupon/:id', couponController.getEditCoupon);
route.post('/editCoupon/:id', couponController.postEditCoupon);
route.get('/activateCoupon/:id', couponController.activateCoupon);
route.get('/deactivateCoupon/:id', couponController.deactivateCoupon);



//offerController

// Offer management routes
route.get('/offermanage', offerController.getOffers);
route.get('/addoffer', offerController.getAddOffer);
route.post('/addoffer', offerController.postAddOffer);
route.get('/editoffer/:id', offerController.getEditOffer);
route.post('/editoffer/:id', offerController.postEditOffer);
route.post('/unlistoffer/:id', offerController.unlistOffer); // Use POST method for unlisting
route.post('/listoffer/:id', offerController.listOffer); // Use POST method for listing




module.exports=route