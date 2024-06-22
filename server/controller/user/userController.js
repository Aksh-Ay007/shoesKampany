const userDatabase = require("../../model/user");
const productDatabase = require("../../model/productsModel");
const category=require('../../model/categoryModel')
const cartDatabase=require('../../model/cartModel')
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const addressDatabase = require("../../model/addressModel");
const offerDatabase = require("../../model/offerModal");
const passport = require("passport")
const google = require("../../../service/auth")
const Review = require('../../model/ratingModel');


const applyOffer = async (product) => {
  const productOffer = await offerDatabase.findOne({ product_name: product._id, unlist: true });
  const categoryOffer = await offerDatabase.findOne({ category_name: product.category, unlist: true });

  if (productOffer && typeof productOffer.discount_Amount === 'number') {
    product.offerPrice = Math.round(product.price - (product.price * (productOffer.discount_Amount / 100)));
  } else if (categoryOffer && typeof categoryOffer.discount_Amount === 'number') {
    product.offerPrice = Math.round(product.price - (product.price * (categoryOffer.discount_Amount / 100)));
  } else {
    product.offerPrice = null;
  }
  return product;
};


const calculateAverageRating = async (productId) => {
  const reviews = await Review.find({ product: productId });
  if (reviews.length === 0) return { averageRating: 0, totalReviews: 0 };
  
  const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
  const averageRating = totalRating / reviews.length;
  return { averageRating, totalReviews: reviews.length };
};

const home = async (req, res) => {
  try {
    const isUser = req.session.user;
    let cart = null;
    if (isUser) {
      cart = await cartDatabase.findOne({ user: req.session.user._id }).populate('items.productId');
    }

    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;

    let allProduct = await productDatabase.find({ list: 'listed' }).skip(skip).limit(limit).populate('category');
    allProduct = await Promise.all(allProduct.map(applyOffer));

    allProduct = await Promise.all(allProduct.map(async (product) => {
      const { averageRating, totalReviews } = await calculateAverageRating(product._id);
      const discountPercentage = product.offerPrice ? ((product.price - product.offerPrice) / product.price * 100).toFixed(0) : null;
      return {
        ...product._doc,
        discountPercentage: discountPercentage,
        originalPrice: product.price,
        price: product.offerPrice || product.price,
        averageRating,
        totalReviews
      };
    }));

    res.render('home', { isUser, allProduct, cart });
  } catch (error) {
    console.error("Home Page Error:", error);
    res.status(500).send("Internal Server Error");
  }
};



// get method login

const userLogin = async (req, res) => {
  try {
    const successMessage = req.flash("success")[0];
    const errorMessage = req.flash("error")[0];
    if (req.session.user) {
      res.redirect("/");
    } else {
      res.render("login");
    }
  } catch (error) {
    res.status(500).send("error occurred");
  }
};

// google auth 
const googleAuth = (req, res) => {
  try {
      passport.authenticate('google', {
          scope:
              ['email', 'profile']
      })(req, res)
  } catch (err) {
      console.log('Error on google authentication ${err}')
  }
}




// google auth callback from the auth service
const googleAuthCallback = (req, res, next) => {
  try {
      passport.authenticate('google', (err, user, info) => {
          if (err) {
              console.log('Error on google auth callback: ${err}')
              return next(err);
          }
          if (!user) {
            console.log("ero");
              return res.redirect('/userlogin');
          }
          req.logIn(user, (err) => {
              if (err) {
                  return next(err);
              }
              // Store the user ID in the session
              req.session.user = user.id;
              return res.redirect('/');
          });
      })(req, res, next);
  } catch (err) {
      console.log('Error on google callback ${err}');
}
}



//Checking Membership
const postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the user by email
    const user = await userDatabase.findOne({ email });

    // Check if user exists
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/userlogin");
    }

    // Check if the user is blocked
    if (user.isBlocked) {
      req.flash("error", "You are blocked by admin.");
      return res.redirect("/userlogin");
    }

    // Check if the entered password is correct
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      req.flash("error", "Invalid password.");
      return res.redirect("/userlogin");
    }

    // Set user session
    req.session.user = {
      _id: user._id,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      // Add other necessary properties if needed
    };

    // Redirect to home page after successful login
    req.flash("success", "User logged in successfully.");
    return res.redirect("/");
  } catch (error) {
    req.flash("error", "Error occurred during login.");
    return res.status(500).send("Error occurred");
  }
};


const userlogout = async (req, res) => {
  req.session.destroy(function (err) {
    if (err) {
    } else {
      res.redirect("/");
    }
  });
};



//user register get method


const signup = (req, res) => {
  try {
    const errorMessage = req.flash("error");
    const successMessage = req.flash("success");
    res.render("signup", { errorMessage, successMessage });
  } catch (error) {
    res.status(500).send("Error occurred during get signup");
  }
};



//// postSignup function

const postSignup = async (req, res) => {
  try {
    const { firstname, lastname, email, password } = req.body;

    // Check if a user with the same email already exists
    const existingUser = await userDatabase.findOne({ email });

    if (existingUser) {
      // User with this email already exists
      req.flash(
        "error",
        "User with this email already exists. Please try a different email."
      );
      return res.redirect("/usersignup");
    } else {
      // Generate OTP by passing the req object
      const otp = generateOTP(req);
      await sendOTPByEmail(email, otp);

      console.log("Generated OTP:", otp);

      // Store their details temporarily
      req.session.userDetails = {
        firstname,
        lastname,
        email,
        password,
      };
      req.session.otp = otp;

      return res.redirect("/otp");
    }
  } catch (error) {
    return res.status(500).send("Error occurred during post signup");
  }
};



//Generate OTP function with req parameter

const generateOTP = (req) => {
  const now = new Date();
  const expireTime = new Date(now.getTime() + 1 * 60000); // 1 minute expiry

  // Check if req.session exists
  if (req && req.session) {
    req.session.expireTime = expireTime;
  }

  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTPByEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP for Signup",
      text: `Your OTP for signup is: ${otp}`,
    };

    await transporter.sendMail(mailOptions);

  } catch (error) {
    throw error;
  }
};


//resend otp

const getResendOtp = async (req, res) => {
  try {
    if (!req.session.userDetails) {
      return res.redirect("/usersignup");
    }

    const { email } = req.session.userDetails;

    // Generate a new OTP
    const otp = generateOTP(req);
    console.log(otp, "resend otp");

    // Send OTP via email
    await sendOTPByEmail(email, otp);

    // Update session with new OTP and expiration time
    req.session.otp = otp;
    req.session.expireTime = new Date(Date.now() + 5 * 60000); // 5 minutes expiry

    console.log(otp, "otp");
    return res.redirect("/otp");
  } catch (error) {
    console.log("Error in getResendOtp:", error);
    return res.status(500).send("Error occurred during resend OTP");
  }
};



///forgot password

const getForgotPassword = async (req, res) => {
  console.log("getForgotPassword");
  try {
    res.render("forgotPassword", { expireTime: req.session.expireTime });
  } catch (error) {
    return res
      .status(500)
      .send("Error occurred during getting forgot password");
  }
};

// postForgotPassword handler
const postForgotPassword = async (req, res) => {
  try {
    const email = req.body.email;

    if (!email) {
      return res.status(400).send("Email is missing.");
    }

    const user = await userDatabase.findOne({ email: email });

    if (user) {
      const otp = generateOTP(req);
      console.log("Generated OTP:", otp);

      const emailText = `Hello ${email}, this is from ShoesKampany. Your OTP is: ${otp}`;


      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your OTP for forgot password",
        text: emailText,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.log("Error sending OTP for forgot password:", error);
          return res.status(500).send("Error sending OTP for forgot password");
        } else {
          console.log("OTP sent: ", otp);
          req.session.otp = otp;

          // Calculate expiry time (example: 5 minutes)
          const expireTime = new Date(Date.now() + 5 * 60000);
          req.session.expireTime = expireTime;

          res.redirect("/forgototp");
        }
      });
    } else {
      res.redirect("/forgotpassword");
    }
  } catch (error) {
    return res
      .status(500)
      .send("Error occurred during posting forgot password");
  }
};



//to resend otp for forgot password
const getForgotResendOtp = async (req, res) => {
  try {
    const email = req.body.email;

  } catch (error) {
    console.log("Error in getResendOtp:", error);
    req.flash("error", "Error occurred during resend OTP");
    return res.status(500).send("Error occurred during forgot resend OTP");
  }
};

//to get the new password page
const getNewPassword = async (req, res) => {
  try {
    res.render("newPassword");
  } catch (error) {
    console.log("Error in getResendOtp:", error);
    return res.status(500).send("Error occurred during get new password");
  }
};

const postNewPassword = async (req, res) => {
  try {
      const { oldPassword, newPassword, confirmPassword } = req.body;
      const userId = req.session.user._id;

      // Find the user
      const user = await userDatabase.findById(userId);
      if (!user) {
          return res.status(404).send("User not found");
      }

      // Check if old password is correct
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) {
          req.flash('error', 'Old password is incorrect');
          return res.redirect('/newPassword');
      }

      // Check if new password and confirm password match
      if (newPassword !== confirmPassword) {
          req.flash('error', 'New passwords do not match');
          return res.redirect('/newPassword');
      }

      // Hash the new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // Update the user's password
      user.password = hashedPassword;
      await user.save();

      req.flash('success', 'Password updated successfully');
      return res.redirect('/userlogin');
  } catch (error) {
      console.error('Error in postNewPassword:', error);
      req.flash('error', 'An error occurred while changing the password');
      return res.redirect('/newPassword');
  }
};





//address management
const Showprofile = async (req, res) => {
  try {
    const user = req.session.user;
    const userId = user._id;
    const addresses = await addressDatabase.find({ user: userId });
    const errors = req.session.errors;
    const msg = req.query.msg;

    let message;
    switch (msg) {
      case 'namesuc':
        message = 'Name updated successfully.';
        break;
      case 'nameerr':
        message = 'Error updating name.';
        break;
      case 'nochange':
        message = 'No changes were made.';
        break;
      default:
        message = null;
    }

    res.render('profile', { addresses, errors, msg: message, user });
  } catch (e) {
    console.log(e);
    res.status(500).send("Internal Error");
  }
};









//get addaddress
const getAddress = async (req, res) => {
  try {
    // Check if user session is available
    if (!req.session.user || !req.session.user._id) {
      // Redirect user to login page or handle the error appropriately
      return res.redirect("/login");
    }

    const userId = req.session.user._id;
    const addresses = await addressDatabase.find({ user: userId });
    const errors = req.session.errors;

    if (addresses && addresses.length > 1) {
      res.render('addaddress', { addresses, errors });
    }
    res.render('addaddress', { errors });
  } catch (e) {
    console.log(e);
    res.status(500).send("Internal Error");
  }
};





const addaddress = async (req, res) => {
  const userId = req.session.user._id;

  try {
    const name = req.body.name;
    console.log(name);
    const mobile = req.body.mobile;
    const address = req.body.address;
    const district = req.body.district;
    const state = req.body.state;
    let pincode = req.body.pincode;
    const landmark = req.body.landmark;

    // Remove spaces from pincode before validation
    pincode = pincode.replace(/\s/g, "");

    // Check if any of the required fields are missing
    if (!name || !mobile || !address || !district || !state || !pincode) {
      return res.status(400).json({ errors: ["All fields are required"] });
    }

    // Validate mobile number to ensure it contains exactly 10 digits
    if (!/^[\d]{10}$/.test(mobile)) {
      return res.status(400).json({ errors: ["Mobile number must be 10 digits"] });
    }

    // Validate pincode to ensure it contains exactly 6 digits
    if (!/^[\d]{6}$/.test(pincode)) {
      return res.status(400).json({ errors: ["PinCode must be 6 digits"] });
    }

    // Check if the address already exists
    const checkExists = await addressDatabase.findOne({
      user: userId,
      name: name.trim(),
      mobile: mobile.trim(),
      address: address.trim(),
      district: district.trim(),
      state: state,
      pincode: pincode.trim()
    });

    if (checkExists) {
      // Address already exists, redirect with error message
      return res.redirect("/profile?msg=exists");
    }

    // Create a new address if it doesn't already exist
    const newAddress = new addressDatabase({
      user: userId,
      name: name,
      mobile: mobile,
      address: address,
      district: district,
      state: state,
      pincode: pincode,
      landmark: landmark // Optional
    });

    console.log(newAddress,"new");

    await newAddress.save();

    // Redirect with success message
  return  res.redirect("/manageAddresses");
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
};









const getmanageAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const user = req.session.user;
    const addresses = await addressDatabase.find({ user: userId}) || [];
    // console.log(addresses,"husdf");
    res.render('manageAddresses', { addresses,user});
  } catch (e) {
    console.log(e);
    res.status(500).send("Internal Error");
  }
};

const deleteAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.session.user._id;
console.log("heree");
    // Find and delete the address
    const result = await addressDatabase.deleteOne({ _id: addressId, user: userId });

    return res.json({ message: 'Address deleted successfully.' });
  } catch (error) {
    console.error('Error deleting address:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};


const showEditAddress = async (req, res) => {
  try {
    const id = req.params.id;
    const user = req.session.user;
    const userId = req.session.user ? req.session.user._id : null;

    if (!userId) {
      // If user is not logged in, redirect to login page or handle the error accordingly
      return res.status(401).send("Unauthorized: Please log in first.");
    }

    const address = await addressDatabase.findById(id);
    res.render("editaddress", { addr: address, userId,user });
  } catch (error) {
    console.error('Error showing edit address:', error);
    res.status(500).send("Internal Server Error");
  }
};


const saveAddress = async (req, res) => {
  const id = req.params.id;
  try {
    await addressDatabase.findByIdAndUpdate(id, req.body)
      .then((data) => {
        if (!data) {
          res.redirect("/manageAddresses?msg=erredit");
        } else {
          res.redirect("/manageAddresses?msg=editsucc");
        }
      })
      .catch((err) => {
        res.status(500).send({ message: "Error updating user information" });
      });
  } catch (error) {
    console.error("Error saving address:", error);
    res.redirect("/manageAddresses?msg=erredit");
  }
};


const showEditUsername = (req, res) => {
  const { firstname, lastname, email } = req.session.user;
  res.render("editusername", { firstname, lastname, email });
};

const editUsername = async (req, res) => {
  try {
    const id = req.session.user._id;
    const user = await userDatabase.findById(id);

    const editFirstname = req.body.firstname;
    const editLastname = req.body.lastname;

    if (user.firstname === editFirstname && user.lastname === editLastname) {
      return res.redirect("/profile?msg=nochange");
    }

    user.firstname = editFirstname;
    user.lastname = editLastname;
    await user.save();

    req.session.user.firstname = editFirstname;
    req.session.user.lastname = editLastname;

    // Redirect with success message
    res.redirect("/profile?msg=namesuc");
  } catch (e) {
    console.log(e);
    res.redirect("/profile?msg=nameerr");
  }
};












const checkoutaddress=async(req,res)=>{

 

  try {

    const userId = req.session.user._id;
   
    
    const name = req.body.name;
    const mobile = req.body.mobile;
    const address = req.body.address;
    const district = req.body.district;
    const state = req.body.state;
    let pincode = req.body.pincode;
    const landmark = req.body.landmark;

    // Remove spaces from pincode before validation
    pincode = pincode.replace(/\s/g, "");

    // Check if any of the required fields are missing
    if (!name || !mobile || !address || !district || !state || !pincode) {
      return res.status(400).json({ errors: ["All fields are required"] });
    }

    // Validate mobile number to ensure it contains exactly 10 digits
    if (!/^[\d]{10}$/.test(mobile)) {
      return res.status(400).json({ errors: ["Mobile number must be 10 digits"] });
    }

    // Validate pincode to ensure it contains exactly 6 digits
    if (!/^[\d]{6}$/.test(pincode)) {
      return res.status(400).json({ errors: ["PinCode must be 6 digits"] });
    }

    
    // Create a new address if it doesn't already exist
    const newAddress = new addressDatabase({
      user: userId,
      name: name,
      mobile: mobile,
      address: address,
      district: district,
      state: state,
      pincode: pincode,
      landmark: landmark // Optional
    });

    await newAddress.save();

    // Redirect with success message
    res.redirect("/checkout");
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
}




module.exports = {
  userLogin,
  postLogin,
  home,
  signup,
  postSignup,
  getResendOtp,
  userlogout,
  getForgotPassword,
  postForgotPassword,
  getNewPassword,
  postNewPassword,
  getForgotResendOtp,
  getAddress, getmanageAddress,addaddress,Showprofile,checkoutaddress,deleteAddress,showEditAddress,saveAddress,showEditUsername,editUsername,googleAuth,googleAuthCallback
};
