const productDatabase = require("../../model/productsModel");
const categoryDatabase = require("../../model/categoryModel");
const express = require('express');
const app = express();
const userDatabase = require("../../model/user");
const multer = require("multer");
const path = require("path");
const { log } = require("console");
const fs = require('fs');

// Multer configuration for file upload
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed"));
    }
  },
});

const list = async (req, res) => {
  try {
    const categories = await categoryDatabase.find();
    
    // Get sorting criteria from query params
    const sortField = req.query.sortField || 'product_name'; // Default sorting by product name
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1; // Default sorting order is ascending

    // Find and sort products
    const products = await productDatabase.find().populate('category').sort({ [sortField]: sortOrder });

    res.render("products", { products, categories, sortField, sortOrder });
  } catch (error) {
    console.error(error);
    res.render("error"); // Render error page
  }
};

// Render add product page
const addproducts = async (req, res) => {
  try {
    const categories = await categoryDatabase.find();
    res.render("addProduct", { categories });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

// Create a new product
const createproduct = async (req, res) => {
  try {
    if (!req.body) {
      res.render("error");
      return;
    }

    const { category, stock } = req.body;

    if (!req.files || !Array.isArray(req.files)) {
      return res.status(400).send("No files uploaded");
    }

    if (stock < 0) {
      return res.status(400).send("Stock cannot be a negative number");
    }

    const images = req.files.map((file) => file.path);
    const price = parseInt(req.body.price);
    const discount = parseInt(req.body.discount) || 0;

    if (isNaN(price) || isNaN(discount)) {
      res.render("error");
      return;
    }

    const totalPrice = Math.round(price * (1 - discount / 100));
    const categories = await categoryDatabase.findById(category);

    if (!categories) {
      res.status(404).send({ message: "Category not found" });
      return;
    }

    const product = new productDatabase({
      product_name: req.body.p_name,
      category: category,
      brand: req.body.brand,
      price: price,
      color: req.body.color,
      size: req.body.size,
      description: req.body.stat,
      discount: discount,
      stock: parseInt(stock),
      images: images,
      total_price: totalPrice,
    });

    await product.save();
    res.redirect("/admin/products");
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
};

// Delete a product
const productDelete = async (req, res) => {
  const id = req.params.id;

  try {
    const deleteProduct = await productDatabase.findByIdAndDelete(id);

    if (!deleteProduct) {
      throw new Error("Error on delete");
    }

    const categories = await categoryDatabase.find();
    const products = await productDatabase.find();
    return res.render("products", { products, categories });
  } catch (error) {
    res.render("error"); // Render error page
  }
};

// Render product edit page
const getproductEdit = async (req, res) => {
  try {
    const id = req.params.id;
    const get = await productDatabase.findById(id);
    const category = await categoryDatabase.find();
    const images = get.images || []; // Set images to an empty array if undefined
    res.render('editproducts', { get, category, images });
  } catch (error) {
    res.render("error"); // Render error page
  }
};

// Update product details
const postproductEdit = async (req, res) => {
  try {
    const productId = req.params.id;
    const updatedData = req.body; // Assuming all form fields are sent in the request body

    console.log('Updated data:', updatedData);

    if (updatedData.stock < 0) {
      return res.status(400).send("Stock cannot be a negative number");
    }

    // Update product_name field
    updatedData.product_name = req.body.pro_name;

    // Handle existing images
    const existingImages = req.body.existingImages || {};
    updatedData.images = Object.entries(existingImages)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .map(entry => entry[1]);

    // Check if there are new files uploaded
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => file.path); // Extract paths of uploaded images
      updatedData.images = updatedData.images.concat(newImages); // Append new images to existing ones
    }

    console.log('Updated data after files:', updatedData);

    // Find product by ID and update
    const updateProduct = await productDatabase.findByIdAndUpdate(productId, updatedData, { new: true });
    await updateProduct.save();

    console.log('Product updated:', updateProduct);

    res.redirect('/admin/products');
  } catch (error) {
    console.error(error);
    res.redirect('/error'); // Redirect to error page
  }
};

const getDeleteSingleImage = async (req, res) => {
  try {
      const { index, id } = req.params;
      const product = await productDatabase.findById(id);

      if (product && product.images && product.images[index]) {
          // Remove the image at the specified index
          const deletedImage = product.images.splice(index, 1)[0];
          await product.save();

          // Optionally, delete the image file from the server
          try {
              fs.unlinkSync(deletedImage);
          } catch (err) {
              console.error("Error deleting image file:", err);
          }
      }

      res.redirect(`/admin/productedit/${id}`);
  } catch (error) {
      console.log(error);
      res.status(500).send("Error occurred during deleting single image of the product");
  }
};

// Block or unblock a product
const block = async (req, res) => {
  try {
    const productId = req.query.id;

    const product = await productDatabase.findById(productId);
    product.list = product.list === "listed" ? "unlisted" : "listed";
    await product.save();

    res.redirect("/admin/products");
  } catch (error) {
    res.render("error");
  }
};

// Export controller methods
module.exports = {
  list,
  addproducts,
  createproduct,
  productDelete,
  block,
  getproductEdit,
  postproductEdit,
  upload,
  getDeleteSingleImage
};