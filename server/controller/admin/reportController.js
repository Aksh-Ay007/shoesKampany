const OrderDatabase = require('../../model/orderModal');
const PDFDocument = require('pdfkit-table');
const moment = require('moment');

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.isAdmin) {
        next();
    } else {
        res.redirect('/adminlogin');
    }
};

const getSalesReports = async (req, res) => {
    try {
        const { start, end, range, page = 1, limit = 5 } = req.query;
        let startDate, endDate;

        // Same logic as before to determine start and end dates

        if (range === 'daily') {
            startDate = moment().startOf('day');
            endDate = moment().endOf('day');
        } else if (range === 'weekly') {
            startDate = moment().startOf('week');
            endDate = moment().endOf('week');
        } else if (range === 'monthly') {
            startDate = moment().startOf('month');
            endDate = moment().endOf('month');
        } else if (range === 'yearly') {
            startDate = moment().startOf('year');
            endDate = moment().endOf('year');
        } else if (start && end && moment(start).isValid() && moment(end).isValid()) {
            startDate = moment(start);
            endDate = moment(end).endOf('day');
        } else {
            startDate = moment().subtract(1, 'month').startOf('day');
            endDate = moment().endOf('day');
        }

        console.log(`Fetching orders from ${startDate.toDate()} to ${endDate.toDate()}`);

        const skip = (page - 1) * limit;

    
        const orders = await OrderDatabase.find({
            status: "Delivered",
            orderDate: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        })
        .populate('user_id', 'firstname lastname')
        .skip(skip)
        .limit(limit)
        .sort({ orderDate: -1 });


        const totalOrders = await OrderDatabase.countDocuments({
            status: "Delivered",
            orderDate: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        });
        const totalPages = Math.ceil(totalOrders / limit);

        let totalSales = 0;
        let totalDiscount = 0;
        let totalCoupons = 0;

      
        orders.forEach(order => {
            order.orderedItems.forEach(item => {
                totalSales += item.price * item.quantity;
            });
            totalDiscount += order.discount || 0;
            totalCoupons += order.couponDiscount || 0;
        });

       const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

        res.render('salesReport', {
            orders,
            user: req.session.user,
            totalSales,
            totalDiscount,
            totalCoupons,
            totalOrders, // Pass the actual total orders count
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
            range,
            queryString,
            currentPage: page,
            totalPages: totalPages,
            startIndex: (page - 1) * limit + 1 // Pass the starting index for the current page
        });
    } catch (error) {
        res.status(500).render('error', {
            message: "Error occurred while fetching sales report",
            user: req.session.user
        });
    }
};

const generatePDFReport = async (req, res) => {
    try {
        const { start, end, range } = req.query;
        let startDate, endDate;
        // Same logic as in getSalesReports function
        if (range === 'daily') {
            startDate = moment().startOf('day');
            endDate = moment().endOf('day');
        } else if (range === 'weekly') {
            startDate = moment().startOf('week');
            endDate = moment().endOf('week');
        } else if (range === 'monthly') {
            startDate = moment().startOf('month');
            endDate = moment().endOf('month');
        } else if (range === 'yearly') {
            startDate = moment().startOf('year');
            endDate = moment().endOf('year');
        } else if (start && end && moment(start).isValid() && moment(end).isValid()) {
            startDate = moment(start);
            endDate = moment(end).endOf('day');
        } else {
            startDate = moment().subtract(1, 'month').startOf('day');
            endDate = moment().endOf('day');
        }

        console.log(`Generating PDF report from ${startDate.toDate()} to ${endDate.toDate()}`);

        const orders = await OrderDatabase.find({
            status: "Delivered",
            orderDate: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        })
        .populate('user_id', 'firstname lastname')
        .sort({ orderDate: -1 });

        // Rest of the generatePDFReport function remains the same
        // ...
    } catch (error) {
        res.status(500).send("Error generating PDF report");
    }
};

module.exports = {
    isAuthenticated,
    getSalesReports,
    generatePDFReport
};