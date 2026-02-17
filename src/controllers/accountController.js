const Account = require("../models/account");
const { verifyAccountCredentials } = require("../services/accountService");
const { verifyAccountCallback } = require("../callbacks/accountCallback");

exports.listAccounts = async (req, res) => {
  const { orgId } = req.query;

  if (!orgId) {
    return res.status(400).json({ error: "Organization ID is required" });
  }

  try {
    const accounts = await Account.find({ orgId }).lean();
    res.status(200).json({
      code: 200,
      data: accounts,
      message: accounts.length > 0 ? "Success" : "No accounts found",
    });
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
    res.status(201).json({ code: 201, message: "Account created successfully", data: newAccount});
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

exports.getAccountByEmail = async (req, res) => {
  try {
    const { email } = req.query;
    const account = await Account.findOne({ email });
    if (!account) return res.status(404).json({ error: "Account not found" });
    res.status(200).json(account);
  } catch (err) {
    console.log(err);
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

    const data = req.body;

    const updateData = {
      limit: data.limit,
      time_gap: data.time_gap,
    };

    if (data.smtp) {
      updateData.smtp = data.smtp;
    }

    if (data.oauth) {
      updateData.limit = data.oauth.limit;
      updateData.time_gap = data.oauth.time_gap;
    }

    if (data.warmup) {
      updateData.warmup = data.warmup;
    }

    const updatedAccount = await Account.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      code: 200,
      message: "Account details updated successfully",
      data: updatedAccount
    });
  } catch (err) {
    res.status(400).json({
      error: "Failed to update account",
      details: err.message
    });
  }
};

exports.updateAccountPartial = async (req, res) => {
  try {
    const { id } = req.params;
    const existingAccount = await Account.findById(id);
    if (!existingAccount) {
      return res.status(404).json({ error: "Account not found" });
    }

    const updateData = req.body;

    const updatedAccount = await Account.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({ code: 200, message: "Account details updated successfully", data: updatedAccount });
  } catch (err) {
    res.status(400).json({ error: "Failed to update account", details: err.message });
  }
};

exports.updateWarmupSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const existingAccount = await Account.findById(id);
    if (!existingAccount) {
      return res.status(404).json({ error: "Account not found" });
    }

    const wasEnabled = existingAccount.warmup?.enabled || false;
    const warmupData = req.body.warmup || {};
    
    // Validate dailyReplyTarget: min should be maxEmailPerDay, max should be 100 or unlimited
    if (warmupData.dailyReplyTarget !== undefined) {
      const maxEmailPerDay = warmupData.maxEmailPerDay || existingAccount.warmup?.maxEmailPerDay || 0;
      const dailyReplyTarget = warmupData.dailyReplyTarget;
      
      if (dailyReplyTarget < maxEmailPerDay) {
        return res.status(400).json({ 
          error: `dailyReplyTarget (${dailyReplyTarget}) must be at least maxEmailPerDay (${maxEmailPerDay})` 
        });
      }
      
      // Max is 100 or unlimited (we'll allow any value >= maxEmailPerDay)
      if (dailyReplyTarget > 0 && dailyReplyTarget < maxEmailPerDay) {
        return res.status(400).json({ 
          error: `dailyReplyTarget must be at least ${maxEmailPerDay} (maxEmailPerDay value)` 
        });
      }
    }
    
    Object.assign(existingAccount.warmup, warmupData);
    const isNowEnabled = existingAccount.warmup?.enabled || false;

    const updatedAccount = await existingAccount.save();

    if (isNowEnabled && !wasEnabled && existingAccount.state === "connected") {
      try {
        const { initializeWarmupJob } = require("../services/warmupJobService");
        await initializeWarmupJob(updatedAccount);
      } catch (error) {
        console.error("Error initializing warmup job:", error.message);
      }
    }

    res.status(200).json({ code: 200, message: "Warmup settings updated successfully", data: updatedAccount });
  } catch (err) {
    res.status(400).json({ error: "Failed to update warmup settings", details: err.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const deletedAccount = await Account.findByIdAndDelete(req.params.id);
    if (!deletedAccount)
      return res.status(404).json({ code: 404, message: "Account not found" });
    res.status(200).json({ code: 200, data: deletedAccount, message: "Account deleted" });
  } catch (err) {
    res.status(500).json({ code: 500, error: "Failed to delete account", details: err.message });
  }
};

exports.verifyAccount = async (req, res) => {
  try {
    const { imap, smtp, proxy, smtpEhloName } = req.body;

    if (!smtp || !smtp.auth || !smtp.auth.user || !smtp.auth.pass) {
      return res.status(400).json({ code: 400, message: "SMTP credentials are required" });
    }

    const account = await Account.findOne({ email: smtp.auth.user });
    if (account) {
      return res.status(400).json({ code: 400, message: "Account already exists." });
    }

    const result = await verifyAccountCredentials({
      imap,
      smtp,
      proxy,
      smtpEhloName,
    });

    if (!result.success) {
      return res.status(400).json({ code: 400, ...result });
    }

    res.status(200).json({ code: 200, ...result });
  } catch (err) {
    res.status(500).json({
      success: false,
      code: 500,
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
