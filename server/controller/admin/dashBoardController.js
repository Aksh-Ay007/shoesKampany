const OrderDatabase = require('../../model/orderModal');
const Order = require('../../model/orderModal');
const Product = require('../../model/productsModel');


const getDashboard = async (req, res) => {
  try {
      const { filter } = req.query;
      console.log(filter);
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
      } else if (filter === 'weekly') {
          // Filter orders for the current week
      } else if (filter === 'daily') {
          // Filter orders for the current day
      }

      
  

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

  console.log(labelsWithoutYearAndMonth,data);

let monthsOfCurrentYear = [];
    let currentyear = currentDate.getFullYear();

    for (let month = 1; month < 13; month++) {
        monthsOfCurrentYear.push(`${currentyear}-${month.toString().padStart(2, '0')}`);
}

const orderPerMounth=await Order.aggregate([
    {
    $group:{
      _id: { $dateToString: { format: "%Y-%m", date: "$orderDate"} },
      count:{$sum:1}
    }
}
])

const mountdata = [];

monthsOfCurrentYear.forEach((month) => {
  const orderForMonth = orderPerMounth.find((order) => order._id === month);

  if (orderForMonth) {
    mountdata.push(orderForMonth.count);
  } else {
    mountdata.push(0);
}
});



const startYear = 2019; // You can adjust this to your desired starting year


const allYears = [];
for (let year = startYear; year <= currentYear; year++) {
    allYears.push(year);
}


const orderPerYear = await Order.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: "%Y", date: "$orderDate" } },
        count: { $sum: 1}
}
  }
  ]);

  const orderData = [];

allYears.forEach((year) => {
  const orderForYear = orderPerYear.find((order) => order._id === year.toString());

  if (orderForYear) {
    orderData.push(orderForYear.count);
  } else {
    orderData.push(0);
}
});

const topProducts = await OrderDatabase.aggregate([

    { $unwind: "$orderedItems" },
  
    {
        $group: {
            _id: "$orderedItems.productId",
            totalQuantity: { $sum: "$orderedItems.quantity" },
            productName: { $first: "$orderedItems.productname" }
        }
    },

    { $sort: { totalQuantity: -1 } },

    { $limit: 10 },
 
]);



const topCategories = await OrderDatabase.aggregate([
    // Unwind the orderedItems array to process each item individually
    { $unwind: "$orderedItems" },
    // Lookup to join with the productDatabase collection
    {
        $lookup: {
            from: "productdatabases", // The name of the products collection
            localField: "orderedItems.productId",
            foreignField: "_id",
            as: "productDetails"
        }
    },
    // Unwind the productDetails array
    { $unwind: "$productDetails" },
    // Group by productDetails.category and sum the quantities
    {
        $group: {
            _id: "$productDetails.category",
            totalQuantity: { $sum: "$orderedItems.quantity" }
        }
    },
    // // Lookup to join with the category collection
    {
        $lookup: {
            from: "categorydbs", // The name of the categories collection
            localField: "_id",
            foreignField: "_id",
            as: "categoryDetails"
        }
    },
    // // Unwind the categoryDetails array
    { $unwind: "$categoryDetails" },
    // // Sort by totalQuantity in descending order
    { $sort: { totalQuantity: -1 } },
    // // Limit to the top 10 categories
    { $limit: 10 },
    // Project the final output

]);

console.log(topCategories);

      res.render('admindashboard', {
          totalRevenue,
          totalOrders,
          totalDiscount,
        
      
          filter,
          data,
          labelsWithoutYearAndMonth,
          monthsOfCurrentYear,
          mountdata,
          allYears,orderData,
          topProducts,
          topCategories

      });
  } catch (err) {
      console.error(err);
      res.status(500).send('An error occurred while fetching dashboard data');
  }
};

    




module.exports = {
  getDashboard
};
