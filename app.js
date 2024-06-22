// app.js

const express = require('express');
const app = express();
const path = require('path');
const adminRouter = require('./server/router/adminRoutes');
const userRouter = require('./server/router/userRoutes');
const mongoose = require('mongoose');
const nocache = require('nocache');
const session = require('express-session');
const dbConnect = require('./server/config/dbConnect');
require('dotenv').config();
const flash = require('connect-flash');
const bodyParser = require("body-parser");
const passport=require("passport")

// Flash middleware
app.use(flash());

// Database Connection
dbConnect();

// Middleware setup
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Flash middleware
app.use(flash());

// Middleware to pass flash messages to the views
app.use((req, res, next) => {
  res.locals.errorMessage = req.flash('error');
  res.locals.successMessage = req.flash('success');
  next();
});

// initialize the passport
app.use(passport.initialize())
app.use(passport.session())
app.use(flash());
app.use(nocache());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.set("view engine", "ejs");

app.use(express.static('public'));
app.set("views", [path.join(__dirname, "views/user"), path.join(__dirname, "views/admin")]);

app.use('/uploads', express.static(path.join(__dirname, "uploads")));

app.use('/admin', adminRouter);
app.use('/', userRouter);

app.listen(5000, () => {
    console.log("Connected");
});
