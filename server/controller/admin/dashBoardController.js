const Order = require('../../model/orderModal');
const Product = require('../../model/productsModel');


const getDashboard = async (req, res) => {
    try {
        const { filter } = req.query;
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
  
        const orders = await Order.find();
  
        const totalRevenue = orders.reduce((total, order) => total + order.finalAmount, 0);
        const totalOrders = orders.length;
  
        const totalDiscount = orders.reduce((total, order) => total + order.discountAmount, 0);
  
        let filteredOrders = orders;
        if (filter === 'yearly') {
            filteredOrders = orders.filter(order => order.orderDate.getFullYear() === currentYear);
        } else if (filter === 'monthly') {
            filteredOrders = orders.filter(order => order.orderDate.getFullYear() === currentYear && order.orderDate.getMonth() + 1 === currentMonth);
        }
  
        const bestSellingProducts = await getBestSellingProducts(filteredOrders);
        const salesData = getSalesData(orders);
        const ordersData = getOrdersData(orders);
        const paymentDetails = getPaymentDetails(orders);
  
        res.render('admindashboard', {
            totalRevenue,
            totalOrders,
            totalDiscount,
            salesData,
            ordersData,
            paymentDetails,
            bestSellingProducts,
            filter,
          });
    } catch (err) {
        console.error(err);
        res.status(500).send('An error occurred while fetching dashboard data');
    }
};
  
function getSalesData(orders) {
    const data = {};
    orders.forEach(order => {
        const year = order.orderDate.getFullYear();
        data[year] = (data[year] || 0) + order.finalAmount;
    });
    return formatDataForChart(data);
}
  
function getOrdersData(orders) {
    const data = {};
    orders.forEach(order => {
        const date = order.orderDate.toISOString().split('T')[0];
        data[date] = (data[date] || 0) + 1;
    });
    return formatDataForChart(data);
}
  
function getPaymentDetails(orders) {
    const data = {};
    orders.forEach(order => {
        const method = order.paymentMethod;
        data[method] = (data[method] || 0) + 1;
    });
    return data;
}
  
function formatDataForChart(data) {
    const labels = Object.keys(data);
    const values = Object.values(data);
    return { labels, values };
}
  
async function getBestSellingProducts(orders) {
    const products = {};
    for (const order of orders) {
      for (const item of order.orderedItems) {
        try {
          const product = await Product.findById(item.productId);
          if (product) {
            if (products[item.productId]) {
              products[item.productId].quantity += item.quantity;
            } else {
              products[item.productId] = { productName: product.product_name, quantity: item.quantity };
            }
          }
        } catch (error) {
          console.error(`Error finding product with ID ${item.productId}:`, error);
        }
      }
    }
    return Object.values(products).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  }


module.exports = {
  getDashboard
};
