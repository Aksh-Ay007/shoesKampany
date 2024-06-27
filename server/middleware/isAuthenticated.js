// middleware/isAuthenticated.js

const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }

    console.log("authiniticated");
    return res.redirect('/userlogin');  // Redirect to login if not authenticated
};

module.exports = isAuthenticated; 
