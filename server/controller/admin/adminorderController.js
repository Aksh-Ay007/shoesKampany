const userDatabase = require('../../model/user');
const productDatabase = require('../../model/productsModel');
const orderDatabase = require("../../model/orderModal");
const categoryDatabase = require("../../model/categoryModel");
const cartDatabase = require("../../model/addressModel");
const adminDatabase = require("../../model/adminModel");
const addressDatabse = require("../../model/addressModel");
const mongoose = require('mongoose');
const OrderDatabase = require('../../model/orderModal');

const viewOrders = async (req, res) => {
    try {
        const orders = await OrderDatabase.find().sort({ orderDate: -1 }).populate('user_id', 'firstname lastname');
        res.render("viewOrders", { orders });
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
};

const singleOrder = async (req, res) => {
    try {
        const orderId = req.params.oid;
        const order = await OrderDatabase.findById(orderId).populate('shippingAddress');

        // Check if order exists
        if (!order) {
            return res.status(404).send("No order found");
        }

        // Reduce stock for each ordered item
        for (const item of order.orderedItems) {
            const productId = item.productId;
            const quantity = item.quantity;

            // Update product stock in the database
            const product = await productDatabase.findById(productId);
            if (!product) {
                console.log(`Product with ID ${productId} not found`);
                continue; // Move to the next item
            }

            // Check if sufficient stock is available
            if (product.stock < quantity) {
                console.log(`Insufficient stock for product with ID ${productId}`);
                continue; // Move to the next item
            }

            // Update the stock
            product.stock -= quantity;

            // Check if stock is zero and update product status
            if (product.stock === 0) {
                product.status = "Out of stock";
            }

            await product.save();
            console.log(`Stock updated for product with ID ${productId}`);
        }

        console.log("hdfvjhdfvjh",order);

        res.render('viewOrder', { order });
    } catch (e) {
        console.log(e.toString());
        res.status(500).send("Internal Server Error");
    }
};

const statusShipped = async (req, res) => {
    try {
        const orderId = req.params.oid;

        // Update order status to "Shipped" in MongoDB
        const updatedOrder = await OrderDatabase.findByIdAndUpdate(orderId, {
            $set: {
                status: "Shipped",
                "orderedItems.$[].status": "Shipped" // Update status for all items
            }
        }, { new: true });

        // Check if order is updated successfully
        if (!updatedOrder) {
            return res.status(404).json({ msg: "Order not found" });
        }

        // Send response
        res.status(200).json({ success: true, message: "Order status updated to Shipped" });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ msg: "Internal server error" });
    }
};
const statusDelivered = async (req, res) => {
    try {
        const orderId = req.params.oid;

        // Update order status to "Delivered", payment status to "Completed",
        // and update status for all items in orderedItems
        const updatedOrder = await OrderDatabase.findByIdAndUpdate(orderId, {
            $set: {
                status: "Delivered",
                paymentStatus: "Completed",
                "orderedItems.$[].status": "Delivered" // Update status for all items
            }
        }, { new: true });

        // Check if order is updated successfully
        if (!updatedOrder) {
            return res.status(404).json({ msg: "Order not found" });
        }

        // Send response
        res.status(200).json({ success: true, message: "Order status updated to Delivered and payment status updated to Completed" });
    }catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).send("Error generating PDF report");
    }
};
module.exports = {
    viewOrders, singleOrder, statusShipped, statusDelivered
};