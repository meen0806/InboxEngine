const mongoose = require("mongoose");

const warmupJobSchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true,
    unique: true,
    index: true,
  },
  status: {
    type: String,
    enum: ["active", "paused", "completed", "on_hold"],
    default: "active",
    index: true,
  },
  currentStep: {
    type: Number,
    default: 1,
    min: 1,
  },
  totalSteps: {
    type: Number,
    default: 30, // Default 30-day warmup plan
  },
  dailyVolume: {
    type: Number,
    default: 0, // Current daily volume for this step
  },
  emailsSentToday: {
    type: Number,
    default: 0,
  },
  emailsSentThisStep: {
    type: Number,
    default: 0,
  },
  stepStartDate: {
    type: Date,
    default: Date.now,
  },
  stepEndDate: {
    type: Date,
  },
  lastSentAt: {
    type: Date,
  },
  nextSendTime: {
    type: Date,
    index: true,
  },
  // Engagement metrics for step advancement
  engagementScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  deliveryRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  replyRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  openRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  clickRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  bounceRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  spamComplaintRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  // Hold/pause reasons
  holdReason: {
    type: String,
    enum: [
      "high_bounce_rate",
      "low_delivery_rate",
      "spam_complaints",
      "low_engagement",
      "manual",
      null,
    ],
    default: null,
  },
  holdStartedAt: {
    type: Date,
  },
  // Schedule configuration
  sendWindows: [
    {
      startHour: { type: Number, min: 0, max: 23 },
      endHour: { type: Number, min: 0, max: 23 },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
warmupJobSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for efficient queries
warmupJobSchema.index({ status: 1, nextSendTime: 1 });
warmupJobSchema.index({ account: 1, status: 1 });

const WarmupJob = mongoose.model("WarmupJob", warmupJobSchema);

module.exports = WarmupJob;

