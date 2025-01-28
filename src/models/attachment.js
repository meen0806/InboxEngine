const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
  filename: { type: String },
  contentType: { type: String },
  content: { type: Buffer }, // Optional, if we need to store it in DB
  size: { type: Number },
  disposition: { type: String }, // e.g., 'inline', 'attachment'
  cid: { type: String }, // For inline content
});

module.exports = mongoose.model('Attachment', attachmentSchema);
