const OrderDatabase = require('../../model/orderModal');
const Order = require('../../model/orderModal');
const Product = require('../../model/productsModel');


const getDashboard = async (req, res) => {
  try {
      const { filter } = req.query;
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;


      let lastSevenDays = [];
    let currentDate = new Date();
    for (let i = 0; i < 7; i++) {
        let day = new Date();
        day.setDate(currentDate.getDate() - i);
        lastSevenDays.push(day.toISOString().split('T')[0]);
    }

const ordersPerDay = await OrderDatabase.aggregate([
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$orderDate" },
        },
        count: { $sum: 1 },
      },
      },
    ]);


const labels = lastSevenDays;
    let data=[]
    // console.log('labelsteh',labels);

    labels.forEach((label) => {
      const order = ordersPerDay.find((o) => o._id === label);
      if (order) {
        data.push(order.count);
      } else {
        data.push(0);
      }
    });

    const labelsWithoutYearAndMonth = labels.map(label => {
      const date = new Date(label);
      return date.getDate();
     });

      const orders = await Order.find();
      const totalRevenue = orders.reduce((total, order) => total + order.finalAmount, 0);
      const totalOrders = orders.length;
      const totalDiscount = orders.reduce((total, order) => total + order.discountAmount, 0);

      let filteredOrders = orders;
      if (filter === 'yearly') {
          filteredOrders = orders.filter(order => order.orderDate.getFullYear() === currentYear);
      } else if (filter === 'monthly') {
          filteredOrders = orders.filter(order => order.orderDate.getFullYear() === currentYear && order.orderDate.getMonth() + 1 === currentMonth);
      } else if (filter === 'weekly') {
          // Filter orders for the current week
      } else if (filter === 'daily') {
          // Filter orders for the current day
      }

      const bestSellingProducts = await getBestSellingProducts(filteredOrders);
      const salesData = getSalesData(filteredOrders);
      const ordersData = getOrdersData(filteredOrders);
      const paymentDetails = getPaymentDetails(filteredOrders);

      res.render('admindashboard', {
          totalRevenue,
          totalOrders,
          totalDiscount,
          salesData,
          ordersData,
          paymentDetails,
          bestSellingProducts,
          filter,
          labels,
          date
      });
  } catch (err) {
      console.error(err);
      res.status(500).send('An error occurred while fetching dashboard data');
  }
};
    const getBestSellingProducts = async (orders) => {
        const productSales = {};
    
        for (const order of orders) {
            for (const item of order.orderedItems) {
                const productId = item.productId.toString();
                productSales[productId] = productSales[productId] ? productSales[productId] + item.quantity : item.quantity;
            }
        }
    
        const bestSellingProducts = Object.entries(productSales)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([productId, quantity]) => ({
                productId,
                quantity
            }));
    
        const productsWithNames = await Promise.all(
            bestSellingProducts.map(async (product) => {
                const dbProduct = await Product.findById(product.productId);
                return {
                    productName: dbProduct.productName,
                    quantity: product.quantity
                };
            })
        );
    
        return productsWithNames;
    };
    
    const getSalesData = (orders) => {
        const salesData = {};
    
        for (const order of orders) {
            const orderDate = order.orderDate.toISOString().split('T')[0];
            salesData[orderDate] = salesData[orderDate] ? salesData[orderDate] + order.finalAmount : order.finalAmount;
        }
    
        return salesData;
    };
    
    const getOrdersData = (orders) => {
        const ordersData = {};
    
        for (const order of orders) {
            const orderDate = order.orderDate.toISOString().split('T')[0];
            ordersData[orderDate] = ordersData[orderDate] ? ordersData[orderDate] + 1 : 1;
        }
    
        return ordersData;
    };
    
    const getPaymentDetails = (orders) => {
        const paymentDetails = {
            'COD': 0,
            'RazorPay': 0,
            'Wallet': 0
        };
    
        for (const order of orders) {
            paymentDetails[order.paymentMethod] += 1;
        }
    
        return paymentDetails;
    };
    




module.exports = {
  getDashboard
};
