// Import required modules
const userDatabase = require("../../model/user");
const path = require("path");
const { render } = require("ejs");

// User Controller
const user = async (req, res) => {
  try {
      const currentPage = parseInt(req.query.page) || 1;
      const itemsPerPage = 10;

      const totalUsers = await userDatabase.countDocuments();
      const totalPages = Math.ceil(totalUsers / itemsPerPage);

      const users = await userDatabase.find()
          .skip((currentPage - 1) * itemsPerPage)
          .limit(itemsPerPage);

      res.render("usermanage", { users, currentPage, totalPages, itemsPerPage });
  } catch (error) {
      console.error(error);
      res.render("error");
  }
};

const userBlock = async (req, res) => {
  try {
      const userId = req.params.userId;
      const userdata = await userDatabase.findById(userId);

      if (!userdata) {
          res.render("error", { message: "User not found" });
          return;
      }

      userdata.isBlocked = !userdata.isBlocked;
      await userdata.save();

      res.redirect("/admin/userside");
  } catch (error) {
      console.error(error);
      res.render("error");
  }
};

// Export controller methods
module.exports = { user, userBlock };
