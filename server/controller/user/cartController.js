const userDatabase = require("../../model/user");
const productDatabase = require("../../model/productsModel");
const categoryDatabase = require("../../model/categoryModel");
const cartDatabase = require("../../model/cartModel");
const offerDatabase = require("../../model/offerModal");

// Function to apply offer to a product
const applyOffer = async (product) => {
  const productOffer = await offerDatabase.findOne({ product_name: product._id, unlist: true });
  const categoryOffer = await offerDatabase.findOne({ category_name: product.category, unlist: true });

  if (productOffer && typeof productOffer.discount_Amount === 'number') {
    product.offerPrice = Math.round(product.price - (product.price * (productOffer.discount_Amount / 100)));
  } else if (categoryOffer && typeof categoryOffer.discount_Amount === 'number') {
    product.offerPrice = Math.round(product.price - (product.price * (categoryOffer.discount_Amount / 100)));
  } else {
    product.offerPrice = null;
  }

  return product;
};
const getCart = async (req, res) => {
  try {
    const userId = req.session.user && req.session.user._id;
    
    if (!userId) {
      return res.redirect("/userlogin"); // Redirect to login if session user is not defined
    }

    let userCart = await cartDatabase.findOne({ user: userId }).populate('items.productId');

    let totalAmount = 0;

    if (!userCart || !userCart.items || userCart.items.length === 0) {
      return res.render('shoping-cart', { 
        user: req.session.user || {}, 
        cart: { items: [], totalAmount: 0 }
      });
    }

    userCart.items = await Promise.all(userCart.items.map(async (item) => {
      if (!item.productId) {
        return item; // Handle case where productId is undefined
      }

      item.productId = await applyOffer(item.productId || {});
      item.productId.images = item.productId.images && item.productId.images.length > 0 ? item.productId.images : ['default_image_path'];
      item.productId.product_name = item.productId.product_name || 'No product name available';
      item.productId.price = item.productId.price || 0;
      item.productId.offerPrice = item.productId.offerPrice || item.productId.price;

      const totalPrice = item.productId.offerPrice * item.quantity;
      totalAmount += totalPrice;
      return item;
    }));

    userCart.totalAmount = totalAmount;
    await userCart.save();

    res.render('shoping-cart', { 
      user: req.session.user || {}, 
      cart: userCart,
    });
  } catch (error) {
   
    res.status(500).render("../error");
  }
};


const addtocart = async (req, res) => {
  try {
 

    const productId = req.params.id;
  
    const userId = req.session.user && req.session.user._id;
    
    if (!userId) {
      return res.redirect("/userlogin"); // Redirect to login if session user is not defined
    }

    let userCart = await cartDatabase.findOne({ user: userId });

    if (!userCart || userCart.length < 1) {
      const product = await productDatabase.findById(productId);
      await applyOffer(product);

      userCart = new cartDatabase({
        user: userId,
        items: [{ productId: product._id, quantity: 1 }]
      });

    } else {
      const existingCartItemIndex = userCart.items.findIndex(item => item.productId.toString() === productId);

      if (existingCartItemIndex !== -1) {
        return res.status(400).json({ message: 'Product already exists in cart' });
      } else {
        const product = await productDatabase.findById(productId);
        await applyOffer(product);
        userCart.items.push({ productId: product._id, quantity: 1 });
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

    const userId = req.session.user && req.session.user._id;
    
    if (!userId) {
      return res.redirect("/userlogin"); // Redirect to login if session user is not defined
    }

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
    const userId = req.session.user && req.session.user._id;
    
    if (!userId) {
      return res.redirect("/userlogin"); // Redirect to login if session user is not defined
    }rs

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

    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getCart, addtocart, deleteCartItem, quantity };
