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

        const { start, end, range } = req.query;


    
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

        const orders = await OrderDatabase.find({
            status: "Delivered",
            orderDate: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        }).populate('user_id', 'firstname lastname');

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
            totalOrders: orders.length,
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
            range,
            queryString
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

        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sales_report.pdf');
        doc.pipe(res);

        doc.fontSize(20).text('Sales Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`From: ${startDate.format('YYYY-MM-DD')} To: ${endDate.format('YYYY-MM-DD')}`, { align: 'center' });
        doc.moveDown();

        const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        doc.fontSize(10).text(`Report Parameters: ${queryString}`, { align: 'center' });
        doc.moveDown();

        let totalSales = 0, totalDiscount = 0, totalCoupons = 0;

        const table = {
            headers: ['SL', 'Username', 'Product', 'Quantity', 'Price', 'Discount', 'Coupon', 'Payment Method', 'Date'],
            rows: orders.flatMap((order, index) => 
                order.orderedItems.map((item, itemIndex) => {
                    let itemTotal = item.price * item.quantity;
                    totalSales += itemTotal;
                    if (index === 0 && itemIndex === 0) {
                        totalDiscount += order.discount || 0;
                        totalCoupons += order.couponDiscount || 0;
                    }

                    return [
                        index === 0 && itemIndex === 0 ? index + 1 : '',
                        index === 0 && itemIndex === 0 ? `${order.user_id.firstname} ${order.user_id.lastname}` : '',
                        item.productname,
                        item.quantity,
                        `Rs. ${item.price}`,
                        index === 0 && itemIndex === 0 ? `Rs. ${order.discount || 0}` : '',
                        index === 0 && itemIndex === 0 ? `Rs. ${order.couponDiscount || 0}` : '',
                        index === 0 && itemIndex === 0 ? order.paymentMethod || '-' : '',
                        index === 0 && itemIndex === 0 ? new Date(order.orderDate).toLocaleDateString() : ''
                    ];
                })
            )
        };

        doc.table(table, {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
            prepareRow: (row, i) => doc.font('Helvetica').fontSize(10)
        });

        doc.moveDown();
        doc.fontSize(12).text(`Total Sales: Rs. ${totalSales}`, { align: 'right' });
        doc.fontSize(12).text(`Total Discount: Rs. ${totalDiscount}`, { align: 'right' });
        doc.fontSize(12).text(`Total Coupons: Rs. ${totalCoupons}`, { align: 'right' });
        doc.fontSize(12).text(`Grand Total: Rs. ${totalSales - totalDiscount - totalCoupons}`, { align: 'right' });
        doc.fontSize(12).text(`Total Orders: ${orders.length}`, { align: 'right' });

        doc.end();
    } catch (error) {
        res.status(500).send("Error generating PDF report");
    }
};

module.exports = {
    isAuthenticated,
    getSalesReports,
    generatePDFReport
};
