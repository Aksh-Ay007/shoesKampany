const Wallet = require('../../model/walletModel');

// Get the wallet information of the logged-in user
const getWallet = async (req, res) => {
  try {
    if (!req.session.user || !req.session.user._id) {
      return res.status(401).send("Unauthorized: Please log in first.");
    }

    const wallet = await Wallet.findOne({ user: req.session.user._id });
    if (!wallet) {
      return res.render('wallet', { balance: 0, transactions: [] });
    }

    res.render('wallet', { balance: wallet.balance, transactions: wallet.transactions });
  } catch (error) {
    console.error('Error in getWallet:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Add a specified amount to the user's wallet
const addToWallet = async (req, res) => {
  try {
    if (!req.session.user || !req.session.user._id) {
      return res.status(401).send("Unauthorized: Please log in first.");
    }

    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { user: req.session.user._id },
      { $inc: { balance: amount }, $push: { transactions: { type: 'deposit', amount, description: `Added balance of ${amount}` } } },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, balance: wallet.balance });
  } catch (error) {

    res.status(500).json({ success: false, message: 'Error adding to wallet' });
  }
};

// Get the wallet transaction history of the logged-in user
const getWalletHistory = async (req, res) => {
  try {
    if (!req.session.user || !req.session.user._id) {
      return res.status(401).send("Unauthorized: Please log in first.");
    }

    const wallet = await Wallet.findOne({ user: req.session.user._id });
    if (!wallet) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }

    res.status(200).json({ success: true, transactions: wallet.transactions });
  } catch (error) {

    res.status(500).json({ success: false, message: 'Error getting wallet history' });
  }
};

module.exports = {
  getWallet,
  addToWallet,
  getWalletHistory
};
