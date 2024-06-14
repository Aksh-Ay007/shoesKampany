const passport = require('passport');
const userSchema=require("../server/model/user");
const GoogleStrategy = require('passport-google-oauth2').Strategy;
const dotenv = require('dotenv').config();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
  passReqToCallback: true
}, async (request, accessToken, refreshToken, profile, done) => {

  try {

    // check the user details on the collection
    let user = await userSchema.findOne({ email: profile.email });
    if (!user) {
      // Create a new user
      user = new userSchema({
        firstname: profile.displayName,
        email: profile.email,
        googleID: profile.id
      });
      // Save the new user
      await user.save();
    }
    done(null, user);
  } catch (err) {
    done(err, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);  // Serialize the user ID
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await userSchema.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

