const userDatabase = require("../../model/user");
const bcrypt = require("bcrypt");




//signup otp
const getsignupOtp = async (req, res) => {
  try {
    const errorMessage = req.flash("errors")[0];
    res.render("otp", { expireTime: req.session.expireTime, errorMessage });
  } catch (error) {
    res.status(500).send("Error rendering otp");
  }
};


//postsignup

const postSignupOtp = async (req, res) => {
  console.log("postSignupOtp");
  try {
    const { digit1, digit2, digit3, digit4, digit5, digit6 } = req.body;

    const enteredOtp = `${digit1 || ""}${digit2 || ""}${digit3 || ""}${
      digit4 || ""
    }${digit5 || ""}${digit6 || ""}`;

    const storedOtp = req.session.otp;
    const expireTime = req.session.expireTime;

    // Check if req.session.userDetails exists and contains the expected properties
    if (!req.session.userDetails || !req.session.userDetails.password) {
      req.flash("errors", "User details not found or missing password");
      return res.redirect("/usersignup");
    }

    if (enteredOtp === storedOtp && new Date() <= new Date(expireTime)) {
      req.flash("error", null);
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(
        req.session.userDetails.password,
        saltRounds
      );


      const newUser = new userDatabase({
        firstname: req.session.userDetails.firstname,
        lastname: req.session.userDetails.lastname,
        email: req.session.userDetails.email,
        password: hashedPassword,
      });

      await newUser.save();
      res.redirect("/userlogin");
    } else {
      req.flash("errors", "Otp is not correct or expired");
      res.redirect("/otp");
    }
  } catch (error) {
    req.flash("errors", "Error occurred during OTP verification");
    res.status(500).send("Error rendering otp");
  }
};



//forgot otp

const getForgotOtp = async (req, res) => {
  try {
    // Your logic to retrieve errorMessage
    const errorMessage = req.flash("error");

    // Render the otp view with the errorMessage
    res.render("forgotOtp", { errorMessage });
  } catch (error) {
    req.flash("error", "Error occurred during getting forgot password");
    return res.status(500).send("Error occurred during forgot password");
  }
};


//postforgototp

const postForgotOtp = async (req, res) => {
  try {
    const { digit1, digit2, digit3, digit4, digit5, digit6 } = req.body;

    // Concatenate OTP digits as strings
    const enteredOtp = `${digit1 || ""}${digit2 || ""}${digit3 || ""}${
      digit4 || ""
    }${digit5 || ""}${digit6 || ""}`;

    // Retrieve stored OTP and expiration time from session
    const storeOtp = req.session.otp;
    const expireTime = req.session.expireTime;

    console.log("Entered for OTP:", enteredOtp);
    console.log("Stored for OTP:", storeOtp);

    // Check if entered OTP matches stored OTP and if it's not expired
    if (storeOtp !== enteredOtp || new Date() > new Date(expireTime)) {
      res.redirect("/forgototp");
    } else {
      res.render("newPassword");
    }
  } catch (error) {
    res.status(500).send("Error rendering post forgot OTP page");
  }
};



module.exports = {
  getsignupOtp,
  postSignupOtp,
  getForgotOtp,
  postForgotOtp,
};
