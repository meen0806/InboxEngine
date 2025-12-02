const Account = require("../models/account");
const WarmupEmail = require("../models/warmupEmail");
const Message = require("../models/message");

/**
 * Calculate email reputation score for an account
 * Reputation is based on multiple factors:
 * - Delivery rate (emails sent successfully)
 * - Reply rate (replies to warmup emails)
 * - Bounce rate (if tracked)
 * - Spam complaints (if tracked)
 * - Account age and activity
 * 
 * @param {Object} account - The account to calculate reputation for
 * @returns {Promise<Number>} - Reputation score (0-100)
 */
const calculateEmailReputation = async (account) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get warmup email statistics for the last 30 days
    const warmupStats = await WarmupEmail.aggregate([
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
          totalReplied: { $sum: { $cond: [{ $eq: ["$isReply", true] }, 1, 0] } },
        },
      },
    ]);

    const stats = warmupStats[0] || {
      totalSent: 0,
      totalFailed: 0,
      totalReplied: 0,
    };

    // Calculate delivery rate (successful sends / total attempts)
    const totalAttempts = stats.totalSent + stats.totalFailed;
    const deliveryRate = totalAttempts > 0 
      ? (stats.totalSent / totalAttempts) * 100 
      : 100;

    // Calculate reply rate (replies / total sent)
    const replyRate = stats.totalSent > 0 
      ? (stats.totalReplied / stats.totalSent) * 100 
      : 0;

    // Account age factor (accounts older than 30 days get bonus)
    const accountAge = (now - account.createdAt) / (1000 * 60 * 60 * 24); // days
    const ageFactor = Math.min(accountAge / 30, 1) * 10; // Max 10 points for 30+ days

    // Activity factor (accounts with consistent activity get bonus)
    const recentActivity = stats.totalSent > 0 ? 5 : 0;

    // Base reputation calculation
    // Delivery rate: 50% weight (0-50 points)
    // Reply rate: 30% weight (0-30 points)
    // Age factor: 10% weight (0-10 points)
    // Activity factor: 10% weight (0-10 points)
    
    const warmup = account.warmup || {};
    const targetReplyRate = warmup.replyRate || 20;
    
    const deliveryScore = (deliveryRate / 100) * 50;
    const replyScore = Math.min((replyRate / targetReplyRate) * 30, 30);
    const ageScore = ageFactor;
    const activityScore = recentActivity;

    let reputation = deliveryScore + replyScore + ageScore + activityScore;

    // Apply penalties for failed sends
    if (stats.totalFailed > 0 && totalAttempts > 0) {
      const failureRate = (stats.totalFailed / totalAttempts) * 100;
      reputation -= failureRate * 0.5; // Penalty for failures
    }

    // Ensure reputation is between 0 and 100
    reputation = Math.max(0, Math.min(100, Math.round(reputation)));

    return reputation;
  } catch (error) {
    console.error(`Error calculating reputation for ${account.email}:`, error.message);
    // Return default reputation on error
    const warmup = account.warmup || {};
    return warmup.reputation || 50;
  }
};

/**
 * Update reputation for an account
 * @param {Object} account - The account to update
 * @returns {Promise<Object>} - Updated account with new reputation
 */
const updateAccountReputation = async (account) => {
  try {
    const reputation = await calculateEmailReputation(account);
    
    if (!account.warmup) {
      account.warmup = {};
    }
    account.warmup.reputation = reputation;
    account.warmup.reputationLastCalculated = new Date();
    
    await account.save();
    
    console.log(`📊 Updated reputation for ${account.email}: ${reputation}/100`);
    
    return account;
  } catch (error) {
    console.error(`Error updating reputation for ${account.email}:`, error.message);
    throw error;
  }
};

/**
 * Update reputation for all warmup-enabled accounts
 */
const updateAllReputations = async () => {
  try {
    const accounts = await Account.find({ "warmup.enabled": true });
    
    console.log(`🔄 Updating reputation for ${accounts.length} account(s)...`);
    
    for (const account of accounts) {
      try {
        await updateAccountReputation(account);
      } catch (error) {
        console.error(`Failed to update reputation for ${account.email}:`, error.message);
      }
    }
    
    console.log(`✅ Reputation update completed`);
  } catch (error) {
    console.error("Error updating all reputations:", error.message);
    throw error;
  }
};

/**
 * Get reputation breakdown for an account
 * @param {Object} account - The account to get breakdown for
 * @returns {Promise<Object>} - Reputation breakdown details
 */
const getReputationBreakdown = async (account) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const warmupStats = await WarmupEmail.aggregate([
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
          totalReplied: { $sum: { $cond: [{ $eq: ["$isReply", true] }, 1, 0] } },
        },
      },
    ]);

    const stats = warmupStats[0] || {
      totalSent: 0,
      totalFailed: 0,
      totalReplied: 0,
    };

    const totalAttempts = stats.totalSent + stats.totalFailed;
    const deliveryRate = totalAttempts > 0 
      ? (stats.totalSent / totalAttempts) * 100 
      : 100;
    const replyRate = stats.totalSent > 0 
      ? (stats.totalReplied / stats.totalSent) * 100 
      : 0;

    const accountAge = (now - account.createdAt) / (1000 * 60 * 60 * 24);

    const warmup = account.warmup || {};
    return {
      reputation: warmup.reputation || 0,
      lastCalculated: warmup.reputationLastCalculated,
      breakdown: {
        deliveryRate: Math.round(deliveryRate * 100) / 100,
        replyRate: Math.round(replyRate * 100) / 100,
        totalSent: stats.totalSent,
        totalFailed: stats.totalFailed,
        totalReplied: stats.totalReplied,
        accountAgeDays: Math.round(accountAge * 100) / 100,
      },
    };
  } catch (error) {
    console.error(`Error getting reputation breakdown for ${account.email}:`, error.message);
    throw error;
  }
};

module.exports = {
  calculateEmailReputation,
  updateAccountReputation,
  updateAllReputations,
  getReputationBreakdown,
};

