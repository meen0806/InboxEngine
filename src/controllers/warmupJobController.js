const Account = require("../models/account");
const WarmupJob = require("../models/warmupJob");
const WarmupEmail = require("../models/warmupEmail");
const {
  initializeWarmupJob,
  pauseWarmupJob,
  resumeWarmupJob,
  updateEngagementMetrics,
  advanceToNextStep,
  shouldAdvanceStep,
  resetNextSendTime,
} = require("../services/warmupJobService");

/**
 * Get all accounts with warmup eligibility status
 */
exports.listEligibleAccounts = async (req, res) => {
  try {
    const { orgId } = req.query;

    if (!orgId) {
      return res.status(400).json({ error: "Organization ID is required" });
    }

    const accounts = await Account.find({ orgId }).lean();
    const warmupJobs = await WarmupJob.find({
      account: { $in: accounts.map((a) => a._id) },
    }).lean();

    const warmupJobMap = new Map(
      warmupJobs.map((job) => [job.account.toString(), job])
    );

    const accountsWithStatus = accounts.map((account) => {
      const warmupJob = warmupJobMap.get(account._id.toString());
      const warmup = account.warmup || {};
      
      return {
        _id: account._id,
        email: account.email,
        name: account.name,
        state: account.state,
        type: account.type,
        warmupEnabled: warmup.enabled || false,
        warmupSettings: {
          maxPerDay: warmup.maxPerDay || 0,
          dailyRampup: warmup.dailyRampup || false,
          rampupIncrement: warmup.rampupIncrement || 5,
          identifierTag: warmup.identifierTag || "",
          reputation: warmup.reputation || 100,
        },
        warmupJob: warmupJob
          ? {
              status: warmupJob.status,
              currentStep: warmupJob.currentStep,
              totalSteps: warmupJob.totalSteps,
              dailyVolume: warmupJob.dailyVolume,
              engagementScore: warmupJob.engagementScore,
              deliveryRate: warmupJob.deliveryRate,
              replyRate: warmupJob.replyRate,
              holdReason: warmupJob.holdReason,
            }
          : null,
        isEligible: account.state === "connected" && account.email,
      };
    });

    res.status(200).json({
      code: 200,
      message: "Accounts retrieved successfully",
      data: accountsWithStatus,
    });
  } catch (error) {
    console.error("Error listing eligible accounts:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to list accounts",
      details: error.message,
    });
  }
};

/**
 * Enable warmup for an account
 */
exports.enableWarmup = async (req, res) => {
  try {
    const { id } = req.params;
    const account = await Account.findById(id);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (account.state !== "connected") {
      return res.status(400).json({
        error: "Account must be connected to enable warmup",
      });
    }

    // Enable warmup
    if (!account.warmup) {
      account.warmup = {};
    }
    account.warmup.enabled = true;

    // Initialize warmup job
    const warmupJob = await initializeWarmupJob(account);

    await account.save();

    res.status(200).json({
      code: 200,
      message: "Warmup enabled successfully",
      data: {
        account: account,
        warmupJob: warmupJob,
      },
    });
  } catch (error) {
    console.error("Error enabling warmup:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to enable warmup",
      details: error.message,
    });
  }
};

/**
 * Disable warmup for an account
 */
exports.disableWarmup = async (req, res) => {
  try {
    const { id } = req.params;
    const account = await Account.findById(id);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Disable warmup
    if (!account.warmup) {
      account.warmup = {};
    }
    account.warmup.enabled = false;

    // Pause warmup job
    try {
      await pauseWarmupJob(account._id, "manual");
    } catch (error) {
      // Job might not exist, which is fine
      console.log("No warmup job to pause:", error.message);
    }

    await account.save();

    res.status(200).json({
      code: 200,
      message: "Warmup disabled successfully",
      data: account,
    });
  } catch (error) {
    console.error("Error disabling warmup:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to disable warmup",
      details: error.message,
    });
  }
};

/**
 * Get warmup job details for an account
 */
exports.getWarmupJob = async (req, res) => {
  try {
    const { id } = req.params;
    const account = await Account.findById(id);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const warmupJob = await WarmupJob.findOne({ account: account._id });

    if (!warmupJob) {
      return res.status(404).json({ error: "Warmup job not found" });
    }

    // Update metrics before returning
    await updateEngagementMetrics(warmupJob);

    // Add hold reason explanation
    let holdExplanation = null;
    if (warmupJob.status === "on_hold" && warmupJob.holdReason) {
      const explanations = {
        high_bounce_rate: `Bounce rate is ${warmupJob.bounceRate.toFixed(2)}% (threshold: 10%). Too many emails are bouncing back.`,
        low_delivery_rate: `Delivery rate is ${warmupJob.deliveryRate.toFixed(2)}% (threshold: 50%). Too few emails are being delivered.`,
        spam_complaints: `Spam complaint rate is ${warmupJob.spamComplaintRate.toFixed(2)}% (threshold: 0.5%). Recipients are marking emails as spam.`,
        low_engagement: `Engagement score is ${warmupJob.engagementScore.toFixed(2)} (threshold: 30). Low open/click/reply rates.`,
        manual: "Warmup was manually paused by an administrator.",
      };
      holdExplanation = explanations[warmupJob.holdReason] || "Warmup is on hold.";
    }

    const responseData = {
      ...warmupJob.toObject(),
      holdExplanation: holdExplanation,
    };

    res.status(200).json({
      code: 200,
      message: "Warmup job retrieved successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error getting warmup job:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to get warmup job",
      details: error.message,
    });
  }
};

/**
 * Pause warmup job
 */
exports.pauseWarmup = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const account = await Account.findById(id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const warmupJob = await pauseWarmupJob(account._id, reason || "manual");

    res.status(200).json({
      code: 200,
      message: "Warmup job paused successfully",
      data: warmupJob,
    });
  } catch (error) {
    console.error("Error pausing warmup job:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to pause warmup job",
      details: error.message,
    });
  }
};

/**
 * Resume warmup job
 */
exports.resumeWarmup = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findById(id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const warmupJob = await resumeWarmupJob(account._id);

    res.status(200).json({
      code: 200,
      message: "Warmup job resumed successfully",
      data: warmupJob,
    });
  } catch (error) {
    console.error("Error resuming warmup job:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to resume warmup job",
      details: error.message,
    });
  }
};

/**
 * Reset next send time for warmup job
 * Query params:
 *   - setToNow: if true, sets nextSendTime to current time (for testing)
 */
exports.resetNextSendTime = async (req, res) => {
  try {
    const { id } = req.params;
    const { setToNow } = req.query;

    const account = await Account.findById(id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const setToNowFlag = setToNow === 'true' || setToNow === true;
    const warmupJob = await resetNextSendTime(account._id, setToNowFlag);

    res.status(200).json({
      code: 200,
      message: setToNowFlag 
        ? "Next send time reset to NOW (for testing)" 
        : "Next send time reset successfully",
      data: {
        nextSendTime: warmupJob.nextSendTime,
        warmupJob: warmupJob,
      },
    });
  } catch (error) {
    console.error("Error resetting next send time:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to reset next send time",
      details: error.message,
    });
  }
};

/**
 * Update warmup job settings
 */
exports.updateWarmupJob = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const account = await Account.findById(id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const warmupJob = await WarmupJob.findOne({ account: account._id });

    if (!warmupJob) {
      return res.status(404).json({ error: "Warmup job not found" });
    }

    // Update allowed fields
    if (updateData.status !== undefined) {
      warmupJob.status = updateData.status;
    }
    if (updateData.currentStep !== undefined) {
      warmupJob.currentStep = updateData.currentStep;
    }
    if (updateData.dailyVolume !== undefined) {
      warmupJob.dailyVolume = updateData.dailyVolume;
    }
    if (updateData.sendWindows !== undefined) {
      warmupJob.sendWindows = updateData.sendWindows;
      warmupJob.nextSendTime = calculateNextSendTime();
    }

    await warmupJob.save();

    res.status(200).json({
      code: 200,
      message: "Warmup job updated successfully",
      data: warmupJob,
    });
  } catch (error) {
    console.error("Error updating warmup job:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to update warmup job",
      details: error.message,
    });
  }
};

/**
 * Manually advance warmup job to next step
 */
exports.advanceStep = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findById(id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const warmupJob = await WarmupJob.findOne({ account: account._id });

    if (!warmupJob) {
      return res.status(404).json({ error: "Warmup job not found" });
    }

    const updatedJob = await advanceToNextStep(warmupJob);

    res.status(200).json({
      code: 200,
      message: "Warmup job advanced to next step",
      data: updatedJob,
    });
  } catch (error) {
    console.error("Error advancing warmup job:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to advance warmup job",
      details: error.message,
    });
  }
};

/**
 * Get comprehensive warmup dashboard
 */
exports.getWarmupDashboard = async (req, res) => {
  try {
    const { orgId } = req.query;

    if (!orgId) {
      return res.status(400).json({ error: "Organization ID is required" });
    }

    const accounts = await Account.find({
      orgId,
      "warmup.enabled": true,
    }).lean();

    const accountIds = accounts.map((a) => a._id);
    const warmupJobs = await WarmupJob.find({
      account: { $in: accountIds },
    }).lean();

    const warmupJobMap = new Map(
      warmupJobs.map((job) => [job.account.toString(), job])
    );

    // Get recent statistics
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dashboardData = {
      summary: {
        totalAccounts: accounts.length,
        activeJobs: warmupJobs.filter((j) => j.status === "active").length,
        pausedJobs: warmupJobs.filter((j) => j.status === "paused").length,
        onHoldJobs: warmupJobs.filter((j) => j.status === "on_hold").length,
        completedJobs: warmupJobs.filter((j) => j.status === "completed").length,
      },
      accounts: await Promise.all(
        accounts.map(async (account) => {
          const warmupJob = warmupJobMap.get(account._id.toString());
          
          // Get recent email stats
          const recentStats = await WarmupEmail.aggregate([
            {
              $match: {
                fromAccount: account._id,
                sentAt: { $gte: last7Days },
              },
            },
            {
              $group: {
                _id: null,
                sent: { $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] } },
                delivered: {
                  $sum: {
                    $cond: [
                      { $in: ["$deliveryStatus", ["delivered", "inbox"]] },
                      1,
                      0,
                    ],
                  },
                },
                opened: { $sum: { $cond: [{ $eq: ["$opened", true] }, 1, 0] } },
                clicked: { $sum: { $cond: [{ $eq: ["$clicked", true] }, 1, 0] } },
                replied: { $sum: { $cond: [{ $eq: ["$isReply", true] }, 1, 0] } },
                bounced: {
                  $sum: {
                    $cond: [{ $eq: ["$deliveryStatus", "bounced"] }, 1, 0],
                  },
                },
                spamComplaints: {
                  $sum: { $cond: [{ $eq: ["$spamComplaint", true] }, 1, 0] },
                },
              },
            },
          ]);

          const stats = recentStats[0] || {
            sent: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
            replied: 0,
            bounced: 0,
            spamComplaints: 0,
          };

          return {
            accountId: account._id,
            email: account.email,
            name: account.name,
            warmupJob: warmupJob
              ? {
                  status: warmupJob.status,
                  currentStep: warmupJob.currentStep,
                  totalSteps: warmupJob.totalSteps,
                  dailyVolume: warmupJob.dailyVolume,
                  engagementScore: warmupJob.engagementScore,
                  deliveryRate: warmupJob.deliveryRate,
                  replyRate: warmupJob.replyRate,
                  openRate: warmupJob.openRate,
                  clickRate: warmupJob.clickRate,
                  bounceRate: warmupJob.bounceRate,
                  spamComplaintRate: warmupJob.spamComplaintRate,
                  holdReason: warmupJob.holdReason,
                }
              : null,
            recentStats: {
              last7Days: stats,
              deliveryRate:
                stats.sent > 0 ? ((stats.delivered / stats.sent) * 100).toFixed(2) : 0,
              openRate:
                stats.delivered > 0
                  ? ((stats.opened / stats.delivered) * 100).toFixed(2)
                  : 0,
              clickRate:
                stats.delivered > 0
                  ? ((stats.clicked / stats.delivered) * 100).toFixed(2)
                  : 0,
              replyRate:
                stats.sent > 0
                  ? ((stats.replied / stats.sent) * 100).toFixed(2)
                  : 0,
              bounceRate:
                stats.sent > 0
                  ? ((stats.bounced / stats.sent) * 100).toFixed(2)
                  : 0,
            },
          };
        })
      ),
    };

    res.status(200).json({
      code: 200,
      message: "Warmup dashboard retrieved successfully",
      data: dashboardData,
    });
  } catch (error) {
    console.error("Error getting warmup dashboard:", error);
    res.status(500).json({
      code: 500,
      error: "Failed to get warmup dashboard",
      details: error.message,
    });
  }
};

