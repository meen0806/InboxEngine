const Account = require("../models/account");
const Mailbox = require("../models/mailbox");
const Message = require("../models/message");
const Attachment = require("../models/attachment");
const { fetchAndSaveMessages } = require("../services/message.service");
const { fetchAndSaveMailboxes } = require("../services/mailboxService");
const {
  sendEmailFromGoogle,
  sendEmailFromMicrosoft,
  sendEmailWithSMTP,
} = require("../util/sendEmail");

exports.getMailboxes = async (req, res) => {
  try {
    const { account } = req.params;
    const mailboxes = await Mailbox.find({ account });
    res.status(200).json(mailboxes);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch mailboxes", details: err.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { account, mailbox } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const searchQuery = req.query.search || "";

    if (page <= 0 || limit <= 0) {
      return res.status(400).json({
        status: "fail",
        message: "Page and limit must be positive numbers",
      });
    }

    const mailboxExists = await Mailbox.findById(mailbox);
    if (!mailboxExists) {
      return res.status(404).json({
        status: "fail",
        message: "Mailbox not found.",
      });
    }

    const skip = (page - 1) * limit;

    const query = {
      account: account,
      mailbox: mailbox,
    };

    if (searchQuery) {
      query.$or = [
        { subject: { $regex: searchQuery, $options: "i" } },
        { body: { $regex: searchQuery, $options: "i" } },
        { "from.name": { $regex: searchQuery, $options: "i" } },
        { "from.address": { $regex: searchQuery, $options: "i" } }
      ];
    }

    const messages = await Message.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const totalMessages = await Message.countDocuments(query);

    const totalPages = Math.ceil(totalMessages / limit);

    return res.status(200).json({
      status: "success",
      message: totalMessages > 0 ? "Messages retrieved successfully." : "No messages found for the given mailbox.",
      data: {
        messages: messages || [],
        totalMessages,
        totalPages: totalPages || 1,
        currentPage: page,
        hasMore: page < totalPages,
      },
    });
  } catch (err) {
    console.error(`Error in getMessages: ${err.message}`);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch messages",
      details: err.message,
    });
  }
};

exports.getMessageById = async (req, res) => {
  try {
    const { message } = req.params;
    const msg = await Message.findById(message).populate("attachments");
    if (!msg) return res.status(404).json({ error: "Message not found" });
    res.status(200).json(msg);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch message", details: err.message });
  }
};

exports.deleteMessages = async (req, res) => {
  try {
    const { account } = req.params;
    const { uids } = req.body;
    await Message.deleteMany({ account, uid: { $in: uids } });
    res.status(200).json({ message: "Messages deleted successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to delete messages", details: err.message });
  }
};

exports.searchMessages = async (req, res) => {
  try {
    const { account } = req.params;
    const { query } = req.body;
    const results = await Message.find({ account, $text: { $search: query } });
    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ error: "Search failed", details: err.message });
  }
};

exports.getAttachment = async (req, res) => {
  try {
    const { attachment } = req.params;
    const attach = await Attachment.findById(attachment);
    if (!attach) return res.status(404).json({ error: "Attachment not found" });

    res.set("Content-Type", attach.contentType);
    res.set("Content-Disposition", `attachment; filename="${attach.filename}"`);
    res.send(attach.content);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch attachment", details: err.message });
  }
};

exports.deliveryTest = async (req, res) => {
  try {
    const { deliveryTest } = req.params;
    const result = await runDeliveryTest(deliveryTest);
    res.status(200).json(result);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Delivery test failed", details: err.message });
  }
};

exports.loadMessages = async (req, res) => {
  try {
    const { account } = req.params;
    const { criteria } = req.body;

    const accountData = await Account.findById(account);
    if (!accountData) {
      return res.status(404).json({ error: "❌ Account not found" });
    }

    const messages = await fetchAndSaveMessages(accountData, criteria);

    res
      .status(200)
      .json({ message: "✅ Messages loaded successfully", messages });
  } catch (err) {
    console.error("❌ Error loading messages:", err.message);
    res
      .status(500)
      .json({ error: "❌ Failed to load messages", details: err.message });
  }
};

exports.loadMailbox = async (req, res) => {
  const { account } = req.params;

  try {
    // Fetch account details from database
    const accountDetails = await Account.findById(account);
    if (!accountDetails) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Fetch and save mailboxes for the account
    const mailboxes = await fetchAndSaveMailboxes(accountDetails);

    res.status(201).json({ success: true, mailboxes });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch and save mailboxes",
      details: error.message,
    });
  }
};

exports.sendTestEmail = async (req, res) => {
  const { email, toEmail, emailTemplate } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const account = await Account.findOne({ email });

  if (!account) {
    return res.status(404).json({ message: "Account not found" });
  }

  let accessToken = account?.oauth2?.tokens?.access_token;
  let expiryTime = account?.oauth2?.tokens?.expiry_date;

  try {
    if (account.type === "gmail") {
      await sendEmailFromGoogle(
        accessToken,
        account.email,
        toEmail,
        expiryTime,
        account,
        emailTemplate
      );
    } else if (account.type === "outlook") {
      await sendEmailFromMicrosoft(
        accessToken,
        account.email,
        toEmail,
        expiryTime,
        account,
        emailTemplate
      );
    } else if (account.type === "imap") {
      await sendEmailWithSMTP(account, toEmail, emailTemplate);
    } else {
      return res.status(400).json({ message: "Unsupported email provider" });
    }

    return res
      .status(200)
      .json({ code: 200, message: "Email sent successfully" });
  } catch (error) {
    return res.status(500).json({ code: 500, message: error.message });
  }
};

async function runDeliveryTest(deliveryTest) {
  return { success: true, message: `Delivery test ${deliveryTest} successful` };
}
