const adminDatabase = require("../../model/adminModel");
const bcrypt = require("bcrypt");

//login
const getAdminLogin = (req, res) => {
  if (req.session.admin) {
    res.redirect("/admin/dashboard");
  } else {
    res.render("adminlogin");
  }
};

const postAdminLogin = (req, res) => {
  try {
    const credentials = {
      email: "admin123@gmail.com",
      password: "Admin123@",
    };
    if (
      req.body.email === credentials.email &&
      req.body.password === credentials.password
    ) {
      req.session.admin = req.body.email;
      res.redirect("/admin/dashboard");
    } else {
      console.log("asdsfds");
    }
  } catch (error) {
    res.redirect("/?error=login_failed");
  }
};

//logout

const adminLogout = (req, res) => {
  req.session.admin = null;
  res.redirect("/admin/adminlogin");
};

module.exports = {
  getAdminLogin,
  postAdminLogin,
  adminLogout,
};

// const viewORders = async(req, res)=>{
//   await orders.find()
//   res.reder(orderpage,{orders})
// }