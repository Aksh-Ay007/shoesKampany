// middleware/isUser.js

const userData = require("../model/user");

const isUser = async (req, res, next) => {
    try {
        const auth = await userData.findById(req.session.user);
        if (req.session.user && auth && !auth.isBlocked) {
            next();
        } else {
            res.redirect('/');
        }
    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
}

module.exports = isUser;
