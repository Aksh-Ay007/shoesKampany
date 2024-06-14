const productDatabase = require('../../model/productsModel')
const categoryDatabase = require('../../model/categoryModel');
const { render } = require('ejs');

// Assuming you're using Express.js
const list = async (req, res) => {
    try {
      // Retrieve categories from the database
      const categories = await categoryDatabase.find();
  
      // Get success message from session and clear it
      const successMessage = req.session.successMessage;
      delete req.session.successMessage;
  
      // Render the 'category.ejs' template and pass the 'categories' and 'successMessage' variables to it
      res.render("category", { categories, successMessage }); // Assuming your EJS file is named 'category.ejs'
    } catch (error) {
      res.render("error"); // Render error page
    }
  };
  

const get_cat = async (req, res) => {
  res.render('addcategory', { message: '' })
}

const add_cat = async (req, res) => {
    try {
        console.log(req.body);

      if (!req.body || !req.body.categoryName) {
        res.status(400).json({ success: false, message: 'Category name is requiredgggg' });
        return;
      }
   
      const categoryName = req.body.categoryName.trim();
   
      if (categoryName.replace(/\s/g, '') === "") {
        res.status(400).json({ success: false, message: 'Category name cannot be just spaces' });
        return;
      }   
  
      if (!/^[A-Z]/.test(categoryName)) {
        res.status(400).json({ success: false, message: 'Category name should start with an uppercase letter' });
        return;
      }
  
      if (!/^[A-Za-z\s]+$/.test(categoryName)) {
        res.status(400).json({ success: false, message: 'Category name should only contain letters and spaces' });
        return;
      }
  
      if (/^\s|\s$/.test(categoryName)) {
        res.status(400).json({ success: false, message: 'No leading or trailing spaces allowed' });
        return;
      }
  
      if (categoryName.length > 6) {
        res.status(400).json({ success: false, message: 'Category name should not exceed six characters' });
        return;
      }
  
      let category = await categoryDatabase.findOne({
        categoryName: { $regex: new RegExp("^" + categoryName + "$", "i") }
      });
  
      if (category) {
        res.status(409).json({ success: false, message: 'Category already exists' });
        return;
      }
  
      // New category
      const add = new categoryDatabase({
        categoryName: categoryName,
        discription: req.body.description ? req.body.description.trim() : ''
      });
   
      await add.save();
      res.status(200).json({ success: true, message: 'Category added successfully' });

    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Internal server error' }); 
    }
  };
  const getEdit = async (req, res) => {
    try {
      const id = req.params.id;
      const get = await categoryDatabase.findById(id);
      if (!get) {
        return res.status(404).send('Category not found');
      }
      res.render('editcategory', { get });
    } catch (error) {
      res.render("error"); // Render error page
    }
  };
  
  const postEdit = async (req, res) => {
    try {
      const categoryId = req.params.id;
      const categoryName = req.body.categoryName ? req.body.categoryName.trim() : '';
      const description = req.body.description ? req.body.description.trim() : '';
  
      if (categoryName.replace(/\s/g, '') === "") {
        res.status(400).json({ success: false, message: 'Category name cannot be just spaces' });
        return;
      }
  
      if (!/^[A-Z]/.test(categoryName)) {
        res.status(400).json({ success: false, message: 'Category name should start with an uppercase letter' });
        return;
      }
  
      if (!/^[A-Za-z\s]+$/.test(categoryName)) {
        res.status(400).json({ success: false, message: 'Category name should only contain letters and spaces' });
        return;
      }
  
      if (/^\s|\s$/.test(categoryName)) {
        res.status(400).json({ success: false, message: 'No leading or trailing spaces allowed' });
        return;
      }
  
      if (categoryName.length > 10) {
        res.status(400).json({ success: false, message: 'Category name should not exceed ten characters' });
        return;
      }
  
      const existingCategory = await categoryDatabase.findOne({
        _id: { $ne: categoryId },
        categoryName: { $regex: new RegExp("^" + categoryName + "$", "i") }
      });
  
      if (existingCategory) {
        res.status(409).json({ success: false, message: 'Category name already exists' });
        return;
      }
  
      await categoryDatabase.findByIdAndUpdate(
        categoryId,
        {
          categoryName: categoryName,
          description: description
        },
        { new: true, runValidators: true }
      );
  
      // Set success message in session
      req.session.successMessage = 'Category updated successfully';
      res.redirect('/admin/category');
    } catch (error) {
      console.error(error);
      if (error.code === 11000 && error.keyPattern && error.keyValue) {
        const duplicateKeyName = Object.keys(error.keyPattern)[0];
        const duplicateKeyValue = error.keyValue[duplicateKeyName];
        res.status(409).json({ success: false, message: `Category with name '${duplicateKeyValue}' already exists` });
      } else {
        res.status(500).json({ success: false, message: 'An error occurred during editing the category' });
      }
    }
  };
  
  
  const deleteCategory = async (req, res) => {
    try {
      const categoryId = req.params.id;
      const category = await categoryDatabase.findByIdAndDelete(categoryId);
  
      if (!category) {
        res.status(404).json({ success: false, message: `Cannot find category with id ${categoryId}` });
        return;
      }
  
      // Optionally, also delete or update products that were in this category
      await productDatabase.updateMany(
        { category: categoryId },
        { $set: { category: null } } // Or delete them if appropriate
      );
  
      res.status(200).json({ success: true, message: 'Category and associated products were successfully updated' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Could not delete this category' });
    }
  };
  
  const blockCategory = async (req, res) => {
    try {
      const categoryId = req.query.id;
      const category = await categoryDatabase.findById(categoryId);
  
      if (!category) {
        res.status(404).json({ success: false, message: 'Category not found' });
        return;
      }
  
      category.list = category.list === "listed" ? "unlisted" : "listed";
      await category.save();
  
      const action = category.list === "listed" ? "listed" : "unlisted";
      res.status(200).json({ success: true, message: `Category successfully ${action}` });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Error updating category status' });
    }
  };
  
  module.exports = {
    list, get_cat, add_cat, getEdit, postEdit, deleteCategory, blockCategory
  };