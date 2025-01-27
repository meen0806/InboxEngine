const Account = require('../models/account');
const { getOAuthTokens, verifyAccountCredentials } = require('../services/accountService');
const { verifyAccountCallback } = require('../callbacks/accountCallback');

// List accounts
exports.listAccounts = async (req, res) => {
  try {
    const accounts = await Account.find();
    res.status(200).json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
};

// Create account

exports.createAccount = async (req, res) => {
  try {
    const newAccount = new Account(req.body);

    // Verify the account before saving
    const result = await verifyAccountCallback(newAccount);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    await newAccount.save();
    res.status(201).json(newAccount);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create account', details: err.message });
  }
};



// Get account by ID
exports.getAccountById = async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.status(200).json(account);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch account' });
  }
};

// Update account
exports.updateAccount = async (req, res) => {
  try {
    const updatedAccount = await Account.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedAccount) return res.status(404).json({ error: 'Account not found' });
    res.status(200).json(updatedAccount);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update account' });
  }
};

// Delete account
exports.deleteAccount = async (req, res) => {
  try {
    const deletedAccount = await Account.findByIdAndDelete(req.params.id);
    if (!deletedAccount) return res.status(404).json({ error: 'Account not found' });
    res.status(200).json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
};

// Verify account credentials
exports.verifyAccount = async (req, res) => {
  try {
    const { imap, smtp, proxy, smtpEhloName } = req.body;
    const result = await verifyAccountCredentials({ imap, smtp, proxy, smtpEhloName });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to verify account', details: err.message });
  }
};
