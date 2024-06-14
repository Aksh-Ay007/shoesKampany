const Wishlist = require('../../model/wishlistModel');
const Cart = require('../../model/cartModel');
const Product = require('../../model/productsModel');
const Offer = require("../../model/offerModal");
const Category = require("../../model/categoryModel");

// Function to apply offer to a product
const applyOffer = async (product) => {
  try {
    // Find offer for the product
    const productOffer = await Offer.findOne({ product_name: product._id, unlist: true });
    const categoryOffer = await Offer.findOne({ category_name: product.category, unlist: true });

    // Calculate offer price if offer exists
    if (productOffer && typeof productOffer.discount_Amount === 'number') {
      product.offerPrice = Math.round(product.price - (product.price * (productOffer.discount_Amount / 100)));
    } else if (categoryOffer && typeof categoryOffer.discount_Amount === 'number') {
      product.offerPrice = Math.round(product.price - (product.price * (categoryOffer.discount_Amount / 100)));
    } else {
      // No offer, set offer price to null
      product.offerPrice = null;
    }
  } catch (error) {
    console.error("Error applying offer:", error);
    // Handle error
  }
  return product;
};

// Route handler to get wishlist
const getWishlist = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.render('login');
    }

    const userId = req.session.user._id;
    
    // Fetch user's cart and wishlist
    const userCart = await Cart.findOne({ user: userId }).populate('items.productId');
    const userWishlist = await Wishlist.findOne({ user: userId }).populate('items.productId');

    // Apply offer to each product in the wishlist
    const wishlistWithOffer = await Promise.all(userWishlist.items.map(async (item) => {
      if (item.productId) {
        const productWithOffer = await applyOffer(item.productId.toObject());
        item.productId.offerPrice = productWithOffer.offerPrice;
      }
      return item;
    }));

    res.render('wishlist', { wishlist: wishlistWithOffer, user: req.session.user, cart: userCart });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res.status(500).send("Error while rendering wishlist page");
  }
};
const addToWishlist = async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user._id;

        let userWishlist = await Wishlist.findOne({ user: userId });

        if (!userWishlist) {
            userWishlist = new Wishlist({
                user: userId,
                items: [{ productId: productId }]
            });
        } else {
            const existingWishlistItemIndex = userWishlist.items.findIndex(item => item.productId.toString() === productId);

            if (existingWishlistItemIndex !== -1) {
                return res.status(400).json({ message: 'Product already in wishlist' });
            } else {
                userWishlist.items.push({ productId: productId });
            }
        }

        await userWishlist.save();
        res.status(200).json({ message: 'Product added to wishlist' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

const removeWishlist = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.render('login');
        }

        const userId = req.session.user._id;
        const productId = req.params.id;

        const userWishlist = await Wishlist.findOne({ user: userId });

        if (!userWishlist) {
            return res.status(404).json({ message: "Wishlist not found" });
        }

        const removeProductIndex = userWishlist.items.findIndex(item => item.productId.toString() === productId);

        if (removeProductIndex === -1) {
            return res.status(404).json({ message: "Product not found in wishlist" });
        }

        userWishlist.items.splice(removeProductIndex, 1);
        await userWishlist.save();

        res.status(200).json({ message: 'Product removed from wishlist' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

const addToCart = async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user._id;

        let userCart = await Cart.findOne({ user: userId });

        if (!userCart) {
            userCart = new Cart({
                user: userId,
                items: [{ productId: productId, quantity: 1 }]
            });
        } else {
            const existingCartItemIndex = userCart.items.findIndex(item => item.productId.toString() === productId);

            if (existingCartItemIndex !== -1) {
                userCart.items[existingCartItemIndex].quantity += 1;
            } else {
                userCart.items.push({ productId: productId, quantity: 1 });
            }
        }

        await userCart.save();

        // Remove item from wishlist
        const userWishlist = await Wishlist.findOne({ user: userId });
        if (userWishlist) {
            const removeProductIndex = userWishlist.items.findIndex(item => item.productId.toString() === productId);
            if (removeProductIndex !== -1) {
                userWishlist.items.splice(removeProductIndex, 1);
                await userWishlist.save();
            }
        }

        res.status(200).json({ message: 'Product added to cart and removed from wishlist' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

module.exports = { getWishlist, addToWishlist, removeWishlist, addToCart };
