const Account = require('../models/account');
const Mailbox = require('../models/mailbox');
const Message = require('../models/message');
const Attachment = require('../models/attachment');

const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const ImapFlow = require('imapflow');
const { fetchAndSaveMessages } = require('../services/mailboxService');
const { fetchAndSaveMailboxes } = require('../services/mailboxService');
// Get mailboxes
exports.getMailboxes = async (req, res) => {
  try {
    const { account } = req.params;
    const mailboxes = await Mailbox.find({ account });
    res.status(200).json(mailboxes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mailboxes', details: err.message });
  }
};


// Get messages
exports.getMessages = async (req, res) => {
  try {
    const { account } = req.params;
    const { mailbox } = req.params;
    const messages = await Message.find({ "account_id": account, "mailbox_id":mailbox });
    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages', details: err.message });
  }
};

// Get message by ID
exports.getMessageById = async (req, res) => {
  try {
    const { message } = req.params;
    const msg = await Message.findById(message).populate('attachments');
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    res.status(200).json(msg);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch message', details: err.message });
  }
};

// Delete messages
exports.deleteMessages = async (req, res) => {
  try {
    const { account } = req.params;
    const { uids } = req.body; // List of message UIDs
    await Message.deleteMany({ account, uid: { $in: uids } });
    res.status(200).json({ message: 'Messages deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete messages', details: err.message });
  }
};

// Search messages
exports.searchMessages = async (req, res) => {
  try {
    const { account } = req.params;
    const { query } = req.body; // Search query
    const results = await Message.find({ account, $text: { $search: query } });
    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
};

// Get attachment
exports.getAttachment = async (req, res) => {
  try {
    const { attachment } = req.params;
    const attach = await Attachment.findById(attachment);
    if (!attach) return res.status(404).json({ error: 'Attachment not found' });

    res.set('Content-Type', attach.contentType);
    res.set('Content-Disposition', `attachment; filename="${attach.filename}"`);
    res.send(attach.content);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attachment', details: err.message });
  }
};

// Delivery test
exports.deliveryTest = async (req, res) => {
  try {
    const { deliveryTest } = req.params;
    const result = await runDeliveryTest(deliveryTest);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Delivery test failed', details: err.message });
  }
};

// Helper function for delivery test
async function runDeliveryTest(deliveryTest) {
  // Simulated logic for testing delivery
  return { success: true, message: `Delivery test ${deliveryTest} successful` };
}


// Endpoint to fetch messages
exports.loadMessages = async (req, res) => {
  try {
    const { account } = req.params;
    const { criteria} = req.body; 
    const accountData = await Account.findById(account);
    if (!accountData) return res.status(404).json({ error: 'Account not found' });

    // Fetch and save messages
    await fetchAndSaveMessages(accountData,criteria);

    res.status(200).json({ message: 'Messages loaded successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load messages', details: err.message });
  }
};

// POST /api/accounts/:account/mailboxes
exports.loadMailbox =  async (req, res) => {
  const { account } = req.params;

  try {
    const accountDetails = await Account.findById(account);
    if (!accountDetails) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    await accountData.save();
    const mailboxes = await fetchAndSaveMailboxes(accountDetails);
    res.status(201).json({ success: true, mailboxes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch and save mailboxes', details: error.message });
  }
};


exports.sendTestEmail = async (req, res) => {
  const { email, toEmail } = req.body;

  const account = await Account.findOne({ email });

   if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const accessToken = account?.oauth2?.tokens?.access_token;
  const refreshToken = account?.oauth2?.tokens.refresh_token;
  const expiryTime = account?.oauth2?.tokens.expires_in;
  const expiryDate = account?.oauth2.tokens.expiry_date;

 
    const emailfromOutlook = await sendEmailFromGoogle(
      accessToken,
      account.email,
      toEmail,
      expiryDate,
      account
    );
  

  return res.status(200).json({ message: "Email sent suceessfully" });
};
