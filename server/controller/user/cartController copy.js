const userDatabase = require("../../model/user");
const productDatabase = require("../../model/productsModel");
const category=require('../../model/categoryModel')
const cartDatabase=require('../../model/cartModel')


const getCart = async (req, res) => {
  try {
    const userId = req.session.user._id;
    let userCart = await cartDatabase.findOne({ user: userId }).populate('items.productId');

    let totalAmount = 0;

    if (userCart && userCart.items && userCart.items.length > 0) {
      userCart.items = userCart.items.map(item => {
        item.productId = item.productId || {};
        item.productId.images = item.productId.images && item.productId.images.length > 0 ? item.productId.images : ['default_image_path'];
        item.productId.product_name = item.productId.product_name || 'No product name available';
        item.productId.price = item.productId.price || 0;
        const totalPrice = (item.productId.price * item.quantity);
        totalAmount += totalPrice;
        return item;
      });
      userCart.totalAmount = totalAmount;
      await userCart.save();
    }

    res.render('shoping-cart', { user: req.session.user || {}, cart: userCart });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).render("../error");
  }
};


// Other functions remain unchanged

const addtocart = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.session.user._id;

    let userCart = await cartDatabase.findOne({ user: userId });

    // Check if user is logged in
    if (!userCart || userCart.length < 1) {
      userCart = new cartDatabase({
        user: userId,
        items: [{ productId: productId, quantity: 1 }]
      });

    } else {
      const existingCartItemIndex = userCart.items.findIndex(item => item.productId.toString() === productId);

      if (existingCartItemIndex !== -1) {
        // Product already exists in cart
        return res.status(400).json({ message: 'Product already exists in cart' });
      } else {
        userCart.items.push({ productId: productId, quantity: 1 });
      }
    }

    await userCart.save();
    res.redirect('/shoping-cart');
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

const deleteCartItem = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.session.user._id;

    let userCart = await cartDatabase.findOne({ user: userId });

    if (!userCart || userCart.items.length < 1) {
      return res.status(404).render('error');
    }

    const itemIndex = userCart.items.findIndex(item => item.productId.toString() === productId);

    if (itemIndex === -1) {
      return res.status(404).render('error');
    }

    userCart.items.splice(itemIndex, 1);

    await userCart.save();
    res.send('success');
  } catch (error) {
    res.status(500).send('error500');
  }
};

const quantity = async (req, res) => {
  try {
      const productId = req.params.id;
      const action = req.query.action;
      const userId = req.session.user._id;

      const cart = await cartDatabase.findOne({ user: userId });
      const product = await productDatabase.findById(productId);

      if (!cart) {
          return res.status(404).json({ error: 'Cart not found' });
      }

      let item = cart.items.find(item => item.productId.toString() === productId);

      if (!item) {
          return res.status(404).json({ error: 'Item not found in cart' });
      }

      if (action === "dec" && item.quantity > 1) {
          item.quantity--;
      } else if (action === "inc") {
          if (item.quantity >= 5) {
              return res.status(400).json({ error: 'Maximum quantity per person is 5' });
          }
          if (item.quantity < product.stock) {
              item.quantity++;
          } else {
              return res.status(400).json({ error: 'Product is out of stock' });
          }
      }

      await cart.save();

      res.status(200).json({ message: 'Quantity updated successfully' });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
  }
};





module.exports = { getCart, addtocart,deleteCartItem,quantity };
