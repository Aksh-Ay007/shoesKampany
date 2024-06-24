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
        const { start, end, range, page = 1, limit = 10 } = req.query;
        let startDate, endDate;

        // Date range logic
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

        // Fetch paginated orders including returned and canceled statuses
        const orders = await OrderDatabase.find({
            status: { $in: ["Delivered", "Returned", "Canceled"] },
            orderDate: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        })
        .populate('user_id', 'firstname lastname')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ orderDate: -1 });

        // Count total orders
        const totalOrders = await OrderDatabase.countDocuments({
            status: { $in: ["Delivered", "Returned", "Canceled"] },
            orderDate: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        });

        // Calculate totals for all orders in the date range
        const totals = await OrderDatabase.aggregate([
            {
                $match: {
                    status: { $in: ["Delivered", "Returned", "Canceled"] },
                    orderDate: { $gte: startDate.toDate(), $lte: endDate.toDate() }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, "$finalAmount", 0] } },
                    totalCoupons: { $sum: { $ifNull: ["$couponDiscount", 0] } },
                    totalOfferDiscount: { $sum: { $ifNull: ["$offerDiscount", 0] } },
                    totalSalesCount: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] } },
                    totalCanceledReturnedCount: { $sum: { $cond: [{ $in: ["$status", ["Returned", "Canceled"]] }, 1, 0] } }
                }
            }
        ]);

        const { 
            totalSales, 
            totalCoupons, 
            totalOfferDiscount, 
            totalSalesCount, 
            totalCanceledReturnedCount 
        } = totals[0] || { 
            totalSales: 0, 
            totalCoupons: 0, 
            totalOfferDiscount: 0, 
            totalSalesCount: 0, 
            totalCanceledReturnedCount: 0 
        };

        const totalPages = Math.ceil(totalOrders / limit);

        const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

        res.render('salesReport', {
            orders,
            user: req.session.user,
            totalSales,
            totalCoupons,
            totalOfferDiscount,
            totalOrders,
            totalSalesCount,
            totalCanceledReturnedCount,
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
            range,
            queryString,
            currentPage: parseInt(page),
            totalPages: totalPages,
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Error fetching sales report:', error);
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

        // Date range logic (keep as is)
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

        const orders = await OrderDatabase.find({
            status: "Delivered",
            orderDate: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        })
        .populate('user_id', 'firstname lastname')
        .sort({ orderDate: -1 });

        // Create a new PDF document
        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        // Pipe the PDF document to the response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=sales_report_${startDate.format('YYYY-MM-DD')}_to_${endDate.format('YYYY-MM-DD')}.pdf`);
        doc.pipe(res);

        // Add title
        doc.fontSize(18).text('Sales Report', { align: 'center' });
        doc.moveDown();

        // Add date range
        doc.fontSize(12).text(`From: ${startDate.format('YYYY-MM-DD')} To: ${endDate.format('YYYY-MM-DD')}`, { align: 'center' });
        doc.moveDown();

        // Add summary statistics
        let totalSales = 0, totalDiscount = 0, totalCoupons = 0, totalOfferDiscount = 0;
        orders.forEach(order => {
            totalSales += order.finalAmount;
            totalDiscount += order.discountAmount || 0;
            totalCoupons += order.couponDiscount || 0;
            totalOfferDiscount += order.offerDiscount || 0;
        });

        doc.fontSize(14).text('Summary');
        doc.fontSize(10)
           .text(`Total Sales: Rs:${totalSales.toFixed(2)}`)
         
           .text(`Total Coupons: Rs:${totalCoupons.toFixed(2)}`)
           .text(`Total Offer Discount: Rs:${totalOfferDiscount.toFixed(2)}`)
           .text(`Total Orders:Rs:${orders.length}`);
        doc.moveDown();

        // Create the table
        const table = {
            title: "Orders",
            headers: ['Order ID', 'User', 'Total Amount', 'Discount', 'Coupon', 'Offer', 'Final Amount', 'Payment', 'Date'],
            rows: orders.map(order => [
                order._id.toString().slice(-6),
                `${order.user_id.firstname} ${order.user_id.lastname}`,
                `Rs:${order.totalAmount.toFixed(2)}`,
                `Rs:${(order.discountAmount || 0).toFixed(2)}`,
                `Rs:${(order.couponDiscount || 0).toFixed(2)}`,
                `Rs:${(order.offerDiscount || 0).toFixed(2)}`,
                `Rs:${order.finalAmount.toFixed(2)}`,
                order.paymentMethod,
                moment(order.orderDate).format('YYYY-MM-DD HH:mm')
            ])
        };

        // Draw the table
        await doc.table(table, {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
            prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
                doc.font('Helvetica').fontSize(8);
                indexColumn === 0 && doc.addBackground(rectRow, 'white', 0.15);
            },
        });

        // Finalize the PDF and end the stream
        doc.end();

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).send("Error generating PDF report");
    }
};


// controllers/adminController.js
// controllers/adminController.js
const getReturnedCanceledOrders = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        // Fetch returned and canceled orders
        const orders = await OrderDatabase.find({
            status: { $in: ["Returned", "Canceled"] }
        })
        .populate('user_id', 'firstname lastname')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ orderDate: -1 });

        const totalOrders = await OrderDatabase.countDocuments({
            status: { $in: ["Returned", "Canceled"] }
        });

        res.json({
            orders,
            totalOrders,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalOrders / limit),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Error fetching returned and canceled orders:', error);
        res.status(500).json({ message: 'Error occurred while fetching returned and canceled orders' });
    }
};



module.exports = {
    isAuthenticated,
    getSalesReports,
    generatePDFReport,getReturnedCanceledOrders
};