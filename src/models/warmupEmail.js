const mongoose = require("mongoose");

const warmupEmailSchema = new mongoose.Schema({
  fromAccount: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Account", 
    required: true 
  },
  toAccount: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Account", 
    required: true 
  },
  fromEmail: { type: String, required: true },
  toEmail: { type: String, required: true },
  subject: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
  sentDate: { 
    type: Date, 
    required: true,
    index: true 
  },
  status: { 
    type: String, 
    enum: ["sent", "failed", "replied"], 
    default: "sent" 
  },
  errorMessage: { type: String },
  isReply: { type: Boolean, default: false }, // Whether this is a reply to an inbound warmup email
  identifierTag: { type: String }, // Custom warmup identifier tag used in this email
  repliedAt: { type: Date }, // When this email was replied to (if isReply is true)
  // Delivery tracking
  deliveryStatus: {
    type: String,
    enum: ["pending", "delivered", "inbox", "spam", "bounced", "failed"],
    default: "pending"
  },
  landedInInbox: { type: Boolean, default: false }, // Whether email landed in inbox
  savedFromSpam: { type: Boolean, default: false }, // Whether email was saved from spam folder
  checkedAt: { type: Date }, // When delivery status was last checked
  // Engagement tracking
  opened: { type: Boolean, default: false },
  openedAt: { type: Date },
  openCount: { type: Number, default: 0 },
  clicked: { type: Boolean, default: false },
  clickedAt: { type: Date },
  clickCount: { type: Number, default: 0 },
  // Bounce tracking
  bounceReason: { type: String },
  bounceType: { 
    type: String, 
    enum: ["hard", "soft", null],
    default: null 
  },
  // Spam complaint tracking
  spamComplaint: { type: Boolean, default: false },
  spamComplaintAt: { type: Date },
});

warmupEmailSchema.index({ fromAccount: 1, sentDate: 1 });
warmupEmailSchema.index({ toAccount: 1, sentDate: 1 });
warmupEmailSchema.index({ fromAccount: 1, deliveryStatus: 1 });
warmupEmailSchema.index({ fromAccount: 1, status: 1, sentAt: -1 });

const WarmupEmail = mongoose.model("WarmupEmail", warmupEmailSchema);

module.exports = WarmupEmail;

