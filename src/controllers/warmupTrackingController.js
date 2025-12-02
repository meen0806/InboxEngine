const {
  trackOpen,
  trackClick,
  trackBounce,
  trackSpamComplaint,
  trackDeliveryStatus,
  findWarmupEmailByTag,
  detectDeliveryStatus,
  detectDeliveryStatusForAccount,
} = require("../services/warmupTrackingService");
const WarmupEmail = require("../models/warmupEmail");
const Account = require("../models/account");

/**
 * Track email open event
 */
exports.trackOpen = async (req, res) => {
  try {
    const { warmupEmailId } = req.params;

    const warmupEmail = await trackOpen(warmupEmailId);

    res.status(200).json({
      code: 200,
      message: "Open tracked successfully",
      data: warmupEmail,
    });
  } catch (error) {
    console.error("Error tracking open:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to track open",
      details: error.message,
    });
  }
};

/**
 * Track email click event
 */
exports.trackClick = async (req, res) => {
  try {
    const { warmupEmailId } = req.params;

    const warmupEmail = await trackClick(warmupEmailId);

    res.status(200).json({
      code: 200,
      message: "Click tracked successfully",
      data: warmupEmail,
    });
  } catch (error) {
    console.error("Error tracking click:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to track click",
      details: error.message,
    });
  }
};

/**
 * Track email bounce event
 */
exports.trackBounce = async (req, res) => {
  try {
    const { warmupEmailId } = req.params;
    const { bounceReason, bounceType } = req.body;

    const warmupEmail = await trackBounce(
      warmupEmailId,
      bounceReason || "Bounce detected",
      bounceType || "soft"
    );

    res.status(200).json({
      code: 200,
      message: "Bounce tracked successfully",
      data: warmupEmail,
    });
  } catch (error) {
    console.error("Error tracking bounce:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to track bounce",
      details: error.message,
    });
  }
};

/**
 * Track spam complaint event
 */
exports.trackSpamComplaint = async (req, res) => {
  try {
    const { warmupEmailId } = req.params;

    const warmupEmail = await trackSpamComplaint(warmupEmailId);

    res.status(200).json({
      code: 200,
      message: "Spam complaint tracked successfully",
      data: warmupEmail,
    });
  } catch (error) {
    console.error("Error tracking spam complaint:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to track spam complaint",
      details: error.message,
    });
  }
};

/**
 * Track delivery status update
 */
exports.trackDeliveryStatus = async (req, res) => {
  try {
    const { warmupEmailId } = req.params;
    const { deliveryStatus, landedInInbox, savedFromSpam } = req.body;

    if (!deliveryStatus) {
      return res.status(400).json({
        error: "deliveryStatus is required",
      });
    }

    const warmupEmail = await trackDeliveryStatus(
      warmupEmailId,
      deliveryStatus,
      landedInInbox || false,
      savedFromSpam || false
    );

    res.status(200).json({
      code: 200,
      message: "Delivery status updated successfully",
      data: warmupEmail,
    });
  } catch (error) {
    console.error("Error tracking delivery status:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to track delivery status",
      details: error.message,
    });
  }
};

/**
 * Track open by identifier tag (for tracking pixels)
 */
exports.trackOpenByTag = async (req, res) => {
  try {
    const { identifierTag, toEmail } = req.query;

    if (!identifierTag || !toEmail) {
      return res.status(400).json({
        error: "identifierTag and toEmail are required",
      });
    }

    const warmupEmail = await findWarmupEmailByTag(identifierTag, toEmail);

    if (!warmupEmail) {
      return res.status(404).json({
        error: "Warmup email not found",
      });
    }

    await trackOpen(warmupEmail._id);

    // Return 1x1 transparent pixel
    const pixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    res.writeHead(200, {
      "Content-Type": "image/gif",
      "Content-Length": pixel.length,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    res.end(pixel);
  } catch (error) {
    console.error("Error tracking open by tag:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to track open",
      details: error.message,
    });
  }
};

/**
 * Track click by identifier tag (for tracking links)
 */
exports.trackClickByTag = async (req, res) => {
  try {
    const { identifierTag, toEmail } = req.query;

    if (!identifierTag || !toEmail) {
      return res.status(400).json({
        error: "identifierTag and toEmail are required",
      });
    }

    const warmupEmail = await findWarmupEmailByTag(identifierTag, toEmail);

    if (!warmupEmail) {
      return res.status(404).json({
        error: "Warmup email not found",
      });
    }

    await trackClick(warmupEmail._id);

    // Redirect to original URL or return success
    const redirectUrl = req.query.url || "https://example.com";
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Error tracking click by tag:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to track click",
      details: error.message,
    });
  }
};

/**
 * Manually trigger delivery status detection
 */
exports.checkDeliveryStatus = async (req, res) => {
  try {
    const { hours = 24, accountId, startDate, endDate } = req.query;
    const hoursToCheck = parseInt(hours, 10) || 24;

    console.log(`🔍 Manual delivery status check triggered (checking last ${hoursToCheck} hours)`);
    const result = await detectDeliveryStatus(hoursToCheck);

    // Calculate statistics - matching getWarmupStats logic
    if (!accountId) {
      return res.status(400).json({
        code: 400,
        error: "accountId is required",
      });
    }

    // Validate account exists
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Set date range (default: last 30 days) - matching getWarmupStats
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const start = startDate ? new Date(startDate) : defaultStartDate;
    const end = endDate ? new Date(endDate) : now;

    // Build match query - matching getWarmupStats exactly
    const matchQuery = {
      fromAccount: account._id,
      sentAt: { $gte: start, $lte: end },
    };

    // Get warmup email statistics - matching getWarmupStats aggregation
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

    // Get emails received (inbound warmup emails) - matching getWarmupStats
    const emailsReceived = await WarmupEmail.countDocuments({
      toAccount: account._id,
      sentAt: { $gte: start, $lte: end },
      status: "sent",
    });

    res.status(200).json({
      code: 200,
      message: "Delivery status check completed",
      data: {
        checked: result.checked,
        updated: result.updated,
        hoursChecked: hoursToCheck,
        statistics: {
          warmupEmailsSent: stats.totalSent,
          landedInInbox: stats.landedInInbox,
          savedFromSpam: stats.savedFromSpam,
          emailsReceived: emailsReceived,
        },
      },
    });
  } catch (error) {
    console.error("Error checking delivery status:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to check delivery status",
      details: error.message,
    });
  }
};

/**
 * Track delivery status for all warmup emails from a specific account
 * Updates landedInInbox and savedFromSpam for all warmup emails
 */
exports.trackAccountDeliveryStatus = async (req, res) => {
  try {
    const { id } = req.params; // Account ID
    const { hours = 720, onlyPending = false, startDate, endDate } = req.query; // Default: 30 days (720 hours)
    const hoursToCheck = parseInt(hours, 10) || 720;
    const checkOnlyPending = onlyPending === 'true' || onlyPending === true;

    console.log(`🔍 Tracking delivery status for account ${id} (checking last ${hoursToCheck} hours, onlyPending: ${checkOnlyPending})`);
    
    // Validate account exists - matching getWarmupStats
    const account = await Account.findById(id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    
    const result = await detectDeliveryStatusForAccount(id, hoursToCheck, checkOnlyPending);

    // Calculate statistics - matching getWarmupStats logic exactly
    // Set date range (default: last 30 days) - matching getWarmupStats
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const start = startDate ? new Date(startDate) : defaultStartDate;
    const end = endDate ? new Date(endDate) : now;

    // Build match query - matching getWarmupStats exactly
    const matchQuery = {
      fromAccount: account._id,
      sentAt: { $gte: start, $lte: end },
    };

    // Get warmup email statistics - matching getWarmupStats aggregation
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

    // Get emails received (inbound warmup emails) - matching getWarmupStats
    const emailsReceived = await WarmupEmail.countDocuments({
      toAccount: account._id,
      sentAt: { $gte: start, $lte: end },
      status: "sent",
    });

    res.status(200).json({
      code: 200,
      message: "Delivery status tracking completed",
      data: {
        accountEmail: result.accountEmail,
        checked: result.checked,
        updated: result.updated,
        hoursChecked: hoursToCheck,
        onlyPending: checkOnlyPending,
        statistics: {
          warmupEmailsSent: stats.totalSent,
          landedInInbox: stats.landedInInbox,
          savedFromSpam: stats.savedFromSpam,
          emailsReceived: emailsReceived,
        },
      },
    });
  } catch (error) {
    console.error("Error tracking account delivery status:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to track delivery status",
      details: error.message,
    });
  }
};

