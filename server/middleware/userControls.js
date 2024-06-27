const userCollection = require('../model/user');

const block = async (req, res, next) => {
    try {
        const user = req.session.user;
        const userEmail = user ? user.email : req.body.email;
        const check = await userCollection.findOne({ email: userEmail });
        console.log(user,userEmail,check,"122");
        if (!req.session.user || !check || check.isBlocked) {
            req.session.user = null;
            return res.redirect("/userlogin");
            
        }
         else {
            next();
        }
    } catch (error) {
        return res.status(502).send('Error occurred');
    }
}

module.exports = {
    block
}
