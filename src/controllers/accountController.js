const Account = require("../models/account");
const { verifyAccountCredentials } = require("../services/accountService");
const { verifyAccountCallback } = require("../callbacks/accountCallback");

exports.listAccounts = async (req, res) => {
  const { orgId } = req.query;

  if (!orgId) {
    return res.status(400).json({ error: "Organization ID is required" });
  }

  try {
    const accounts = await Account.find({ orgId });
    res.status(200).json(accounts);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch accounts", details: error.message });
  }
};

exports.createAccount = async (req, res) => {
  try {
    const { email } = req.body;

    const existingAccount = await Account.findOne({ email });
    if (existingAccount) {
      return res
        .status(400)
        .json({ code: 400, message: "Account with this email already exists" });
    }

    const newAccount = new Account(req.body);

    const result = await verifyAccountCallback(newAccount);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    await newAccount.save();
    res.status(201).json(newAccount);
  } catch (err) {
    res
      .status(400)
      .json({ error: "Failed to create account", details: err.message });
  }
};

exports.getAccountById = async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) return res.status(404).json({ error: "Account not found" });
    res.status(200).json(account);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch account" });
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const existingAccount = await Account.findById(id);
    if (!existingAccount) {
      return res.status(404).json({ error: "Account not found" });
    }

    Object.assign(existingAccount, req.body);

    const result = await verifyAccountCallback(existingAccount);
    if (!result.success) {
      return res
        .status(400)
        .json({
          code: 400,
          message: "Failed to update account, SMTP verification failed",
        });
    }

    const updatedAccount = await existingAccount.save();

    res.status(200).json(updatedAccount);
  } catch (err) {
    res
      .status(400)
      .json({ error: "Failed to update account", details: err.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const deletedAccount = await Account.findByIdAndDelete(req.params.id);
    if (!deletedAccount)
      return res.status(404).json({ error: "Account not found" });
    res.status(200).json({ message: "Account deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete account" });
  }
};

exports.verifyAccount = async (req, res) => {
  try {
    const { imap, smtp, proxy, smtpEhloName } = req.body;

    if (!smtp || !smtp.auth || !smtp.auth.user || !smtp.auth.pass) {
      return res.status(400).json({ error: "SMTP credentials are required" });
    }

    const result = await verifyAccountCredentials({
      imap,
      smtp,
      proxy,
      smtpEhloName,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to verify account",
      details: err.message,
    });
  }
};

exports.searchAccounts = async (req, res) => {
  try {
    const { query, orgId } = req.query;

    let filter = { orgId };
   

    filter.$or = [
      { email: { $regex: query, $options: "i" } },
      { name: { $regex: query, $options: "i" } },
    ];

    const accounts = await Account.find(filter);
    res.status(200).json({
      code: 200,
      data: accounts,
      message: accounts.length > 0 ? "Success" : "No accounts found",
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch accounts", details: err.message });
  }
};
