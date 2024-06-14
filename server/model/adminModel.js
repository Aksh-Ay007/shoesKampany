const mongoose = require('mongoose')

const adminSchema = new mongoose.Schema({

    email :{
        type : String,
        required : true,
    },
    password :{
        type : String,
        required : true,
    },
    
})

// declaring the collection name
const adminDatabase = new mongoose.model("adminController",adminSchema)

// exporting the module
module.exports = adminDatabase