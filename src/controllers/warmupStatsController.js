const Account = require("../models/account");
const WarmupEmail = require("../models/warmupEmail");
const Message = require("../models/message");
const { detectDeliveryStatusForAccount } = require("../services/warmupTrackingService");

/**
 * Get warmup email statistics for a specific account
 * Automatically checks and updates delivery statuses before returning stats
 */
exports.getWarmupStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    // Validate account exists
    const account = await Account.findById(id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Set date range (default: last 30 days)
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const start = startDate ? new Date(startDate) : defaultStartDate;
    const end = endDate ? new Date(endDate) : now;

    // Calculate hours to check based on date range
    const hoursToCheck = Math.ceil((now - start) / (1000 * 60 * 60)); // Convert milliseconds to hours

    // Check and update delivery statuses before calculating stats
    console.log(`🔍 Checking and updating delivery statuses for account ${account.email} before returning stats`);
    try {
      await detectDeliveryStatusForAccount(id, hoursToCheck, false); // Check all emails, not just pending
    } catch (updateError) {
      // Log error but don't fail the request - still return stats even if update fails
      console.error(`⚠️ Error updating delivery statuses (continuing with stats):`, updateError.message);
    }

    // Build match query
    const matchQuery = {
      fromAccount: account._id,
      sentAt: { $gte: start, $lte: end },
    };

    // Get warmup email statistics
    const warmupStats = await WarmupEmail.aggregate([
      {
        $match: matchQuery,
      },
      {
        $group: {
          _id: null,
          totalSent: { $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] } },
          totalFailed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
          totalReplied: { $sum: { $cond: [{ $eq: ["$isReply", true] }, 1, 0] } },
          landedInInbox: { $sum: { $cond: [{ $eq: ["$landedInInbox", true] }, 1, 0] } },
          savedFromSpam: { $sum: { $cond: [{ $eq: ["$savedFromSpam", true] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ["$deliveryStatus", "delivered"] }, 1, 0] } },
          inInbox: { $sum: { $cond: [{ $eq: ["$deliveryStatus", "inbox"] }, 1, 0] } },
          inSpam: { $sum: { $cond: [{ $eq: ["$deliveryStatus", "spam"] }, 1, 0] } },
          bounced: { $sum: { $cond: [{ $eq: ["$deliveryStatus", "bounced"] }, 1, 0] } },
        },
      },
    ]);

    const stats = warmupStats[0] || {
      totalSent: 0,
      totalFailed: 0,
      totalReplied: 0,
      landedInInbox: 0,
      savedFromSpam: 0,
      delivered: 0,
      inInbox: 0,
      inSpam: 0,
      bounced: 0,
    };

    // Get emails received (inbound warmup emails)
    const emailsReceived = await WarmupEmail.countDocuments({
      toAccount: account._id,
      sentAt: { $gte: start, $lte: end },
      status: "sent",
    });

    // Calculate email performance percentage
    // Performance = (Landed in Inbox + Saved from Spam) / Total Sent * 100
    const totalAttempts = stats.totalSent + stats.totalFailed;
    const successfulDeliveries = stats.landedInInbox + stats.savedFromSpam;
    const emailPerformance = totalAttempts > 0
      ? ((successfulDeliveries / totalAttempts) * 100).toFixed(2)
      : 0;

    // Calculate outbound status breakdown
    const outboundStatus = {
      sent: stats.totalSent,
      failed: stats.totalFailed,
      delivered: stats.delivered,
      inbox: stats.inInbox,
      spam: stats.inSpam,
      bounced: stats.bounced,
      pending: stats.totalSent - (stats.delivered + stats.inInbox + stats.inSpam + stats.bounced + stats.totalFailed),
    };

    // Get recent warmup emails for detailed view
    const recentEmails = await WarmupEmail.find(matchQuery)
      .sort({ sentAt: -1 })
      .limit(50)
      .select("toEmail subject status deliveryStatus landedInInbox savedFromSpam sentAt")
      .lean();

    // Response data
    const response = {
      accountId: account._id,
      accountEmail: account.email,
      period: {
        startDate: start,
        endDate: end,
      },
      statistics: {
        warmupEmailsSent: stats.totalSent,
        landedInInbox: stats.landedInInbox,
        savedFromSpam: stats.savedFromSpam,
        emailsReceived: emailsReceived,
        emailPerformance: parseFloat(emailPerformance),
        outboundStatus: outboundStatus,
        replies: stats.totalReplied,
        replyRate: stats.totalSent > 0
          ? ((stats.totalReplied / stats.totalSent) * 100).toFixed(2)
          : 0,
        deliveryRate: totalAttempts > 0
          ? ((stats.totalSent / totalAttempts) * 100).toFixed(2)
          : 0,
      },
      recentEmails: recentEmails,
    };

    res.status(200).json({
      code: 200,
      message: "Warmup statistics retrieved successfully",
      data: response,
    });
  } catch (error) {
    console.error("Error fetching warmup stats:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to fetch warmup statistics",
      details: error.message,
    });
  }
};

/**
 * Get detailed warmup email list for an account
 */
exports.getWarmupEmails = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50, status, deliveryStatus } = req.query;

    const account = await Account.findById(id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = { fromAccount: account._id };

    if (status) {
      query.status = status;
    }

    if (deliveryStatus) {
      query.deliveryStatus = deliveryStatus;
    }

    const [emails, total] = await Promise.all([
      WarmupEmail.find(query)
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("toAccount", "email name")
        .lean(),
      WarmupEmail.countDocuments(query),
    ]);

    res.status(200).json({
      code: 200,
      message: "Warmup emails retrieved successfully",
      data: {
        emails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching warmup emails:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to fetch warmup emails",
      details: error.message,
    });
  }
};

