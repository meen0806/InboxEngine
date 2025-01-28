const mongoose = require('mongoose');

const mailboxSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  path: { type: String, required: true },
  name: { type: String, required: true },
  delimiter: { type: String },
  totalMessages: { type: Number, default: 0 },
  unseenMessages: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Mailbox', mailboxSchema);
