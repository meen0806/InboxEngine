const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  mailbox: { type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox' },
  uid: { type: Number, required: true },
  subject: { type: String },
  from: [{ name: String, address: String }],
  to: [{ name: String, address: String }],
  cc: [{ name: String, address: String }],
  bcc: [{ name: String, address: String }],
  date: { type: Date },
  body: { type: String },
  attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Attachment' }],
  flags: [{ type: String }], // Example: [ '\\Seen', '\\Flagged' ]
  size: { type: Number },
  headers: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Message', messageSchema);
