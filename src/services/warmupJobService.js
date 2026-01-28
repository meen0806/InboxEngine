const Account = require("../models/account");
const WarmupJob = require("../models/warmupJob");
const WarmupEmail = require("../models/warmupEmail");
const { calculateEmailReputation } = require("./reputationService");

/**
 * Generate a unique tracking phrase for an account
 */
const generateUniqueTrackingPhrase = (account) => {
  const words = [
    "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
    "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi",
    "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega"
  ];
  
  const randomWord1 = words[Math.floor(Math.random() * words.length)];
  const randomWord2 = words[Math.floor(Math.random() * words.length)];
  
  // Add account ID hash for uniqueness
  const accountHash = account._id.toString().substring(0, 4);
  
  return `${randomWord1}-${randomWord2}-${accountHash}`;
};

/**
 * Initialize or update warmup job for an account
 */
const initializeWarmupJob = async (account) => {
  try {
    let warmupJob = await WarmupJob.findOne({ account: account._id });
    
    if (!warmupJob) {
      // Create new warmup job
      const warmup = account.warmup || {};
      
      // Generate unique tracking phrase if not exists
      if (!warmup.identifierTag) {
        warmup.identifierTag = generateUniqueTrackingPhrase(account);
        account.warmup = warmup;
        await account.save();
      }
      
      // Calculate initial daily volume based on step
      const initialStep = 1;
      const baseVolume = warmup.maxEmailPerDay || 5;
      const stepIncrement = warmup.rampupIncrement || 5;
      const initialDailyVolume = baseVolume + ((initialStep - 1) * stepIncrement);
      
      // // Set default send windows (9 AM - 5 PM, spread throughout the day)
      // const sendWindows = [
      //   { startHour: 9, endHour: 12 },
      //   { startHour: 13, endHour: 17 },
      // ];
      
      warmupJob = new WarmupJob({
        account: account._id,
        status: "active",
        currentStep: initialStep,
        totalSteps: 30,
        dailyVolume: initialDailyVolume,
        stepStartDate: new Date(),
        nextSendTime: calculateNextSendTime(),
      });
      
      await warmupJob.save();
      console.log(`✅ Initialized warmup job for ${account.email}`);
    } else {
      // Update existing job if needed
      if (warmupJob.status === "on_hold" && account.warmup?.enabled) {
        warmupJob.status = "active";
        warmupJob.holdReason = null;
        warmupJob.holdStartedAt = null;
        await warmupJob.save();
      }
    }
    
    return warmupJob;
  } catch (error) {
    console.error(`Error initializing warmup job for ${account.email}:`, error.message);
    throw error;
  }
};

/**
 * Calculate next send time based on send windows
 * @param {Number} minIntervalMinutes - Minimum minutes until next send (default: 1 for 1 email per minute)
 */
const calculateNextSendTime = (minIntervalMinutes = 1) => {
  const now = new Date();
  
  // Fast mode: always return 1 minute from now (for testing)
  const isFastMode = process.env.WARMUP_FAST_MODE === 'true';
  if (isFastMode) {
    return new Date(now.getTime() + 1 * 60 * 1000); // 1 minute from now
  }
  
  // Normal mode: add interval minutes
  const minutesToAdd = minIntervalMinutes + Math.floor(Math.random() * 2);
  return new Date(now.getTime() + minutesToAdd * 60 * 1000);
};

/**
 * Update engagement metrics for a warmup job
 */
const updateEngagementMetrics = async (warmupJob) => {
  try {
    const account = await Account.findById(warmupJob.account);
    if (!account) return;
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get metrics from warmup emails
    const stats = await WarmupEmail.aggregate([
      {
        $match: {
          fromAccount: account._id,
          sentAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: null,
          totalSent: { $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] } },
          totalFailed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
          totalDelivered: {
            $sum: {
              $cond: [
                { $in: ["$deliveryStatus", ["delivered", "inbox"]] },
                1,
                0,
              ],
            },
          },
          totalOpened: { $sum: { $cond: [{ $eq: ["$opened", true] }, 1, 0] } },
          totalClicked: { $sum: { $cond: [{ $eq: ["$clicked", true] }, 1, 0] } },
          totalReplied: { $sum: { $cond: [{ $eq: ["$isReply", true] }, 1, 0] } },
          totalBounced: {
            $sum: {
              $cond: [{ $eq: ["$deliveryStatus", "bounced"] }, 1, 0],
            },
          },
          totalSpamComplaints: {
            $sum: { $cond: [{ $eq: ["$spamComplaint", true] }, 1, 0] },
          },
        },
      },
    ]);
    
    const metrics = stats[0] || {
      totalSent: 0,
      totalFailed: 0,
      totalDelivered: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalReplied: 0,
      totalBounced: 0,
      totalSpamComplaints: 0,
    };
    
    const totalAttempts = metrics.totalSent + metrics.totalFailed;
    const delivered = metrics.totalDelivered;
    
    // Calculate rates
    warmupJob.deliveryRate =
      totalAttempts > 0 ? (delivered / totalAttempts) * 100 : 0;
    warmupJob.replyRate =
      metrics.totalSent > 0 ? (metrics.totalReplied / metrics.totalSent) * 100 : 0;
    warmupJob.openRate =
      delivered > 0 ? (metrics.totalOpened / delivered) * 100 : 0;
    warmupJob.clickRate =
      delivered > 0 ? (metrics.totalClicked / delivered) * 100 : 0;
    warmupJob.bounceRate =
      totalAttempts > 0 ? (metrics.totalBounced / totalAttempts) * 100 : 0;
    warmupJob.spamComplaintRate =
      totalAttempts > 0
        ? (metrics.totalSpamComplaints / totalAttempts) * 100
        : 0;
    
    // Calculate overall engagement score
    // Weighted: delivery (40%), reply (30%), open (20%), click (10%)
    warmupJob.engagementScore =
      warmupJob.deliveryRate * 0.4 +
      warmupJob.replyRate * 0.3 +
      warmupJob.openRate * 0.2 +
      warmupJob.clickRate * 0.1;
    
    await warmupJob.save();
    
    return warmupJob;
  } catch (error) {
    console.error("Error updating engagement metrics:", error.message);
    throw error;
  }
};

/**
 * Check if warmup job should advance to next step
 */
const shouldAdvanceStep = (warmupJob) => {
  // Advance if engagement score is good and minimum days in step
  const daysInStep =
    (new Date() - warmupJob.stepStartDate) / (1000 * 60 * 60 * 24);
  const minDaysPerStep = 2; // Minimum 2 days per step
  
  if (daysInStep < minDaysPerStep) {
    return false;
  }
  
  // Check engagement thresholds
  const minEngagementScore = 60; // Minimum 60% engagement
  const minDeliveryRate = 80; // Minimum 80% delivery rate
  const maxBounceRate = 5; // Maximum 5% bounce rate
  const maxSpamComplaintRate = 0.1; // Maximum 0.1% spam complaint rate
  
  if (
    warmupJob.engagementScore >= minEngagementScore &&
    warmupJob.deliveryRate >= minDeliveryRate &&
    warmupJob.bounceRate <= maxBounceRate &&
    warmupJob.spamComplaintRate <= maxSpamComplaintRate
  ) {
    return true;
  }
  
  return false;
};

/**
 * Advance warmup job to next step
 */
const advanceToNextStep = async (warmupJob) => {
  try {
    const account = await Account.findById(warmupJob.account);
    if (!account) return;
    
    if (warmupJob.currentStep >= warmupJob.totalSteps) {
      warmupJob.status = "completed";
      await warmupJob.save();
      return warmupJob;
    }
    
    const warmup = account.warmup || {};
    const baseVolume = warmup.maxEmailPerDay || 5;
    const stepIncrement = warmup.rampupIncrement || 5;
    
    warmupJob.currentStep += 1;
    warmupJob.dailyVolume = baseVolume + ((warmupJob.currentStep - 1) * stepIncrement);
    warmupJob.emailsSentThisStep = 0;
    warmupJob.stepStartDate = new Date();
    warmupJob.stepEndDate = null;
    
    await warmupJob.save();
    
    console.log(
      `📈 Advanced warmup job for ${account.email} to step ${warmupJob.currentStep} (daily volume: ${warmupJob.dailyVolume})`
    );
    
    return warmupJob;
  } catch (error) {
    console.error("Error advancing warmup job:", error.message);
    throw error;
  }
};

/**
 * Check if warmup job should be put on hold
 */
const checkHoldConditions = async (warmupJob) => {
  try {
    const account = await Account.findById(warmupJob.account);
    if (!account) return;
    
    // Don't put jobs on hold if they're already on hold (unless conditions changed)
    if (warmupJob.status === "on_hold") {
      // Check if conditions have improved and we should resume
      const shouldResume = 
        warmupJob.bounceRate <= 10 &&
        warmupJob.deliveryRate >= 50 &&
        warmupJob.spamComplaintRate <= 0.5 &&
        warmupJob.engagementScore >= 30;
      
      if (shouldResume && warmupJob.emailsSentThisStep > 0) {
        // Only resume if we have some data (at least 1 email sent)
        warmupJob.status = "active";
        warmupJob.holdReason = null;
        warmupJob.holdStartedAt = null;
        await warmupJob.save();
        console.log(
          `✅ Warmup job for ${account.email} resumed: Conditions improved`
        );
      }
      return;
    }
    
    // Don't put new jobs on hold if they haven't sent any emails yet
    // Wait until we have some data to make decisions
    if (warmupJob.emailsSentThisStep === 0 && warmupJob.emailsSentToday === 0) {
      return; // Too early to judge, let it start
    }
    
    // Check for high bounce rate (only if we have bounces)
    if (warmupJob.bounceRate > 10 && warmupJob.bounceRate > 0) {
      warmupJob.status = "on_hold";
      warmupJob.holdReason = "high_bounce_rate";
      warmupJob.holdStartedAt = new Date();
      await warmupJob.save();
      console.log(
        `⏸️ Warmup job for ${account.email} put on hold: High bounce rate (${warmupJob.bounceRate.toFixed(2)}%)`
      );
      return;
    }
    
    // Check for low delivery rate (only if we have sent emails)
    if (warmupJob.deliveryRate < 50 && warmupJob.deliveryRate > 0) {
      warmupJob.status = "on_hold";
      warmupJob.holdReason = "low_delivery_rate";
      warmupJob.holdStartedAt = new Date();
      await warmupJob.save();
      console.log(
        `⏸️ Warmup job for ${account.email} put on hold: Low delivery rate (${warmupJob.deliveryRate.toFixed(2)}%)`
      );
      return;
    }
    
    // Check for spam complaints (only if we have complaints)
    if (warmupJob.spamComplaintRate > 0.5 && warmupJob.spamComplaintRate > 0) {
      warmupJob.status = "on_hold";
      warmupJob.holdReason = "spam_complaints";
      warmupJob.holdStartedAt = new Date();
      await warmupJob.save();
      console.log(
        `⏸️ Warmup job for ${account.email} put on hold: Spam complaints detected (${warmupJob.spamComplaintRate.toFixed(2)}%)`
      );
      return;
    }
    
    // Check for low engagement (only if we have some engagement data)
    // Engagement score of 0 is normal for new jobs, so only check if > 0
    if (warmupJob.engagementScore < 30 && warmupJob.engagementScore > 0 && warmupJob.emailsSentThisStep >= 5) {
      // Only check engagement if we've sent at least 5 emails this step
      warmupJob.status = "on_hold";
      warmupJob.holdReason = "low_engagement";
      warmupJob.holdStartedAt = new Date();
      await warmupJob.save();
      console.log(
        `⏸️ Warmup job for ${account.email} put on hold: Low engagement (${warmupJob.engagementScore.toFixed(2)})`
      );
      return;
    }
  } catch (error) {
    console.error("Error checking hold conditions:", error.message);
    throw error;
  }
};

/**
 * Pause warmup job
 */
const pauseWarmupJob = async (accountId, reason = "manual") => {
  try {
    const warmupJob = await WarmupJob.findOne({ account: accountId });
    if (!warmupJob) {
      throw new Error("Warmup job not found");
    }
    
    warmupJob.status = "paused";
    warmupJob.holdReason = reason;
    warmupJob.holdStartedAt = new Date();
    await warmupJob.save();
    
    return warmupJob;
  } catch (error) {
    console.error("Error pausing warmup job:", error.message);
    throw error;
  }
};

/**
 * Resume warmup job
 */
const resumeWarmupJob = async (accountId) => {
  try {
    const warmupJob = await WarmupJob.findOne({ account: accountId });
    if (!warmupJob) {
      throw new Error("Warmup job not found");
    }
    
    warmupJob.status = "active";
    warmupJob.holdReason = null;
    warmupJob.holdStartedAt = null;
    warmupJob.nextSendTime = calculateNextSendTime();
    await warmupJob.save();
    
    return warmupJob;
  } catch (error) {
    console.error("Error resuming warmup job:", error.message);
    throw error;
  }
};

/**
 * Reset next send time for a warmup job
 * @param {string} accountId - Account ID
 * @param {boolean} setToNow - If true, sets nextSendTime to current time (for testing). Default: false
 */
const resetNextSendTime = async (accountId, setToNow = false) => {
  try {
    const warmupJob = await WarmupJob.findOne({ account: accountId });
    if (!warmupJob) {
      throw new Error("Warmup job not found");
    }
    
    if (setToNow) {
      // Set to current time (or 1 second ago to ensure it's in the past)
      warmupJob.nextSendTime = new Date(Date.now() - 1000);
      console.log(`🕐 Reset next send time to NOW for testing: ${warmupJob.nextSendTime}`);
    } else {
      // Recalculate based on send windows
      warmupJob.nextSendTime = calculateNextSendTime();
    }
    
    await warmupJob.save();
    
    return warmupJob;
  } catch (error) {
    console.error("Error resetting next send time:", error.message);
    throw error;
  }
};

module.exports = {
  generateUniqueTrackingPhrase,
  initializeWarmupJob,
  calculateNextSendTime,
  updateEngagementMetrics,
  shouldAdvanceStep,
  advanceToNextStep,
  checkHoldConditions,
  pauseWarmupJob,
  resumeWarmupJob,
  resetNextSendTime,
};

