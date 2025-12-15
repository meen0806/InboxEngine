const Account = require("../models/account");
const WarmupEmail = require("../models/warmupEmail");
const WarmupJob = require("../models/warmupJob");
const Message = require("../models/message");
const { sendEmailFromGoogle, sendEmailFromMicrosoft, sendEmailWithSMTP, sendReplyFromGoogle } = require("../util/sendEmail");
const { generateWarmupEmail: generateTemplateEmail, generateReplyEmail: generateTemplateReply } = require("./warmupTemplateService");
const {
  initializeWarmupJob,
  updateEngagementMetrics,
  shouldAdvanceStep,
  advanceToNextStep,
  checkHoldConditions,
  calculateNextSendTime,
} = require("./warmupJobService");

const getTodayRange = () => {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return { startOfDay, endOfDay };
};

const countWarmupEmailsToday = async (accountId) => {
  const { startOfDay, endOfDay } = getTodayRange();
  
  const count = await WarmupEmail.countDocuments({
    fromAccount: accountId,
    sentDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
    status: "sent",
  });

  return count;
};

/**
 * Calculate effective daily limit with auto-adjust based on reputation
 */
const calculateEffectiveDailyLimit = (account) => {
  const warmup = account.warmup || {};
  let baseLimit = warmup.maxPerDay || 0;
  
  // Auto-adjust based on reputation if enabled
  if (warmup.autoAdjust) {
    const reputation = warmup.reputation || 100;
    if (reputation < 50) {
      // Reduce by 50% if reputation is poor
      baseLimit = Math.floor(baseLimit * 0.5);
    } else if (reputation < 70) {
      // Reduce by 25% if reputation is fair
      baseLimit = Math.floor(baseLimit * 0.75);
    } else if (reputation >= 90) {
      // Increase by 10% if reputation is excellent
      baseLimit = Math.floor(baseLimit * 1.1);
    }
  }
  
  if (!warmup.dailyRampup) {
    return baseLimit;
  }
  
  const increment = warmup.rampupIncrement || 5;
  
  if (!warmup.startDate) {
    return baseLimit;
  }
  
  const now = new Date();
  const startDate = new Date(warmup.startDate);
  const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
  
  const daysInCycle = Math.ceil(baseLimit / increment);
  const dayInCycle = (daysSinceStart % daysInCycle) + 1;
  const effectiveLimit = Math.min(dayInCycle * increment, baseLimit);
  
  return Math.max(0, effectiveLimit);
};

/**
 * Get max emails per day from array [min, max] or single value
 */
const getMaxEmailsPerDay = (maxEmailsPerDay) => {
  if (Array.isArray(maxEmailsPerDay) && maxEmailsPerDay.length >= 2) {
    return maxEmailsPerDay[1]; // Use max value from array
  } else if (Array.isArray(maxEmailsPerDay) && maxEmailsPerDay.length === 1) {
    return maxEmailsPerDay[0];
  } else if (typeof maxEmailsPerDay === 'number') {
    return maxEmailsPerDay;
  }
  return 0;
};

/**
 * Calculate ramp-up email limit based on days since warmup started (CYCLIC)
 * 
 * If dailyRampup is FALSE:
 * - Choose a random value from 1 to maxPerDay
 * - No increment logic, no reply processing
 * 
 * If dailyRampup is TRUE:
 * - maxEmailsPerDay = [startEmails, maxEmails] e.g., [3, 20]
 * - rampupIncrement = emails to add per day e.g., 5
 * 
 * Day 1: 3 (start)
 * Day 2: 3 + 5 = 8
 * Day 3: 8 + 5 = 13
 * Day 4: 13 + 5 = 18
 * Day 5: 18 + 5 = 23 → capped at 20
 * Day 6: RESTART → 3 (start again)
 * Day 7: 8
 * ... and so on
 * 
 * Formula: min(startEmails + (dayInCycle - 1) * rampupIncrement, maxEmails)
 */
const calculateRampupLimit = (warmup, warmupJob) => {
  const maxEmailsPerDay = warmup.maxEmailsPerDay;
  const dailyRampup = warmup.dailyRampup;
  
  // If dailyRampup is false, return random value from 1 to maxPerDay
  if (!dailyRampup) {
    const maxEmails = getMaxEmailsPerDay(maxEmailsPerDay);
    if (maxEmails <= 0) return 0;
    const randomLimit = Math.floor(Math.random() * maxEmails) + 1; // Random from 1 to maxEmails
    console.log(`🎲 Random mode (dailyRampup=false): Sending ${randomLimit} emails today (max: ${maxEmails})`);
    return randomLimit;
  }
  
  const rampupIncrement = warmup.rampupIncrement || 5;
  
  // If not an array with [min, max], return the single value or 0
  if (!Array.isArray(maxEmailsPerDay) || maxEmailsPerDay.length < 2) {
    if (Array.isArray(maxEmailsPerDay) && maxEmailsPerDay.length === 1) {
      return maxEmailsPerDay[0];
    } else if (typeof maxEmailsPerDay === 'number') {
      return maxEmailsPerDay;
    }
    return 0;
  }
  
  const startEmails = maxEmailsPerDay[0]; // e.g., 3
  const maxEmails = maxEmailsPerDay[1];   // e.g., 20
  
  // Calculate cycle length: how many days to go from start to max
  // e.g., start=3, max=20, increment=5 → (20-3)/5 = 3.4 → ceil = 4 increments + 1 day = 5 days
  const incrementsNeeded = Math.ceil((maxEmails - startEmails) / rampupIncrement);
  const cycleLength = incrementsNeeded + 1; // +1 for the starting day
  
  // Calculate days since warmup job started
  const jobStartDate = warmupJob.createdAt || new Date();
  const now = new Date();
  const daysSinceStart = Math.floor((now - new Date(jobStartDate)) / (1000 * 60 * 60 * 24));
  
  // Calculate which day in the current cycle (1-indexed, cycles after reaching max)
  const dayInCycle = (daysSinceStart % cycleLength) + 1;
  
  // Formula: min(startEmails + (dayInCycle - 1) * rampupIncrement, maxEmails)
  const calculatedLimit = startEmails + (dayInCycle - 1) * rampupIncrement;
  const effectiveLimit = Math.min(calculatedLimit, maxEmails);
  
  const totalDays = daysSinceStart + 1;
  const cycleNumber = Math.floor(daysSinceStart / cycleLength) + 1;
  
  console.log(`📈 Ramp-up: Total day ${totalDays}, Cycle ${cycleNumber} Day ${dayInCycle}/${cycleLength}, limit: ${effectiveLimit} emails (start: ${startEmails}, increment: ${rampupIncrement}, max: ${maxEmails})`);
  
  return effectiveLimit;
};

const findPartnerAccount = async (account, allAccounts) => {
  const candidates = allAccounts.filter(
    (acc) =>
      acc._id.toString() !== account._id.toString() &&
      acc.state === "connected" &&
      acc.email
  );

  if (candidates.length === 0) {
    return null;
  }

  const sameOrgPartners = candidates.filter(
    (acc) => acc.orgId === account.orgId
  );

  if (sameOrgPartners.length > 0) {
    return sameOrgPartners[Math.floor(Math.random() * sameOrgPartners.length)];
  }

  const crossOrgPartners = candidates.filter(
    (acc) => acc.orgId !== account.orgId
  );

  if (crossOrgPartners.length > 0) {
    return crossOrgPartners[Math.floor(Math.random() * crossOrgPartners.length)];
  }

  return null;
};

/**
 * Check if weekday
 */
const isWeekday = () => {
  const day = new Date().getDay();
  return day >= 1 && day <= 5; // Monday (1) to Friday (5)
};

/**
 * Generate warmup email with identifier tag and custom domain tracking
 * Uses template service for better template management
 */
const generateWarmupEmail = (identifierTag = "", customDomainTracking = false, templateId = null) => {
  return generateTemplateEmail(identifierTag, customDomainTracking, templateId);
};

/**
 * Generate reply email content
 * Uses template service for better template management
 */
const generateReplyEmail = (originalSubject, originalBody, identifierTag = "", templateId = null) => {
  return generateTemplateReply(originalSubject, originalBody, identifierTag, templateId);
};

/**
 * Find inbound warmup emails that need replies
 */
const findInboundWarmupEmails = async (account, limit = 10) => {
  const { startOfDay, endOfDay } = getTodayRange();

  // Get warmup emails sent TO this account (these are the ones we should reply to)
  const warmupEmails = await WarmupEmail.find({
    toAccount: account._id,
    sentAt: { $gte: startOfDay, $lte: endOfDay },
    status: "sent",
    isReply: false, // Only original warmup emails, not replies
  }).select("fromEmail fromAccount threadId subject").lean();

  if (warmupEmails.length === 0) {
    return [];
  }

  // Create a map of sender emails to their warmup records
  const warmupEmailMap = new Map();
  for (const we of warmupEmails) {
    warmupEmailMap.set(we.fromEmail.toLowerCase(), we);
  }

  // Find messages received today from warmup senders
  const messages = await Message.find({
    account: account._id,
    date: { $gte: startOfDay, $lte: endOfDay },
  })
    .sort({ date: -1 })
    .limit(limit * 3) // Get more to filter
    .lean();

  const warmupMessages = [];

  for (const message of messages) {
    if (warmupMessages.length >= limit) break;

    const fromEmail = message.from?.[0]?.address?.toLowerCase() || "";

    // ONLY process if the sender has a WarmupEmail record for this account
    if (!warmupEmailMap.has(fromEmail)) {
      continue;
    }

    // Check if we already replied to this sender today
    const existingReply = await WarmupEmail.findOne({
      fromAccount: account._id,
      toEmail: fromEmail,
      isReply: true,
      repliedAt: { $gte: startOfDay },
    });

    if (!existingReply) {
      warmupMessages.push(message);
    }
  }

  return warmupMessages;
};

/**
 * Send reply to inbound warmup email
 */
const sendReplyToWarmupEmail = async (account, originalMessage) => {
  try {
    const fromEmail = originalMessage.from?.[0]?.address;
    if (!fromEmail) {
      throw new Error("No from email address found");
    }

    const warmup = account.warmup || {};
    const replyContent = generateReplyEmail(
      originalMessage.subject || "Re: Warmup email",
      originalMessage.body || "",
      warmup.identifierTag || ""
    );

    // Find the original warmup email record
    const originalWarmupEmail = await WarmupEmail.findOne({
      toAccount: account._id,
      fromEmail: fromEmail,
      sentAt: { $lte: originalMessage.date || new Date() },
    }).sort({ sentAt: -1 });

    // If no warmup email found, try to find the sender's account by email
    let senderAccountId = originalWarmupEmail?.fromAccount;
    if (!senderAccountId) {
      const senderAccount = await Account.findOne({ email: fromEmail });
      senderAccountId = senderAccount?._id;
    }

    if (!senderAccountId) {
      console.warn(`⚠️ Could not find sender account for ${fromEmail}, skipping reply record save`);
    }

    let result;
    if (account.type === "gmail") {
      const accessToken = account.oauth2?.tokens?.access_token;
      if (!accessToken) {
        throw new Error("Missing access token for Gmail account");
      }

      const expiryDate = account.oauth2?.tokens?.expiry_date;
      
      // If we have thread info, use reply function
      if (originalMessage.threadId && originalMessage.uid) {
        result = await sendReplyFromGoogle(
          account.email,
          account,
          replyContent,
          originalMessage.messageId,
          originalMessage.threadId,
          account.name || "",
          originalMessage.from?.[0]?.name || "",
          originalMessage.uid
        );
      } else {
        // Regular send
        result = await sendEmailFromGoogle(
          accessToken,
          account.email,
          fromEmail,
          expiryDate,
          account,
          replyContent
        );
      }
    } else if (account.type === "outlook") {
      const accessToken = account.oauth2?.tokens?.access_token;
      if (!accessToken) {
        throw new Error("Missing access token for Outlook account");
      }

      const expiryTime = account.oauth2?.tokens?.expires_at || account.oauth2?.tokens?.expiry_date;
      result = await sendEmailFromMicrosoft(
        accessToken,
        account.email,
        fromEmail,
        expiryTime,
        replyContent,
        account
      );
    } else if (account.type === "imap") {
      result = await sendEmailWithSMTP(account, fromEmail, replyContent);
    } else {
      throw new Error(`Unsupported account type: ${account.type}`);
    }

    // Save reply record only if we have the required fields
    if (senderAccountId && originalMessage?.threadId) {
      const replyRecord = new WarmupEmail({
        fromAccount: account._id,
        toAccount: senderAccountId,
        fromEmail: account.email,
        toEmail: fromEmail,
        threadId: originalMessage.threadId,
        subject: replyContent.subject,
        sentDate: getTodayRange().startOfDay,
        status: "sent",
        identifierTag: warmup.identifierTag || null,
        isReply: true,
        repliedAt: new Date(),
      });

      await replyRecord.save();
    } else {
      console.warn(`⚠️ Skipping reply record save - missing toAccount or threadId for reply from ${account.email} to ${fromEmail}`);
    }

    return result;
  } catch (error) {
    console.error(`❌ Error sending reply from ${account.email}:`, error.message);
    throw error;
  }
};

const sendWarmupEmail = async (fromAccount, toAccount, emailContent) => {
  try {
    let result;

    if (fromAccount.type === "gmail") {
      const accessToken = fromAccount.oauth2?.tokens?.access_token;
      if (!accessToken) {
        throw new Error("Missing access token for Gmail account");
      }

      const expiryDate = fromAccount.oauth2?.tokens?.expiry_date;
      result = await sendEmailFromGoogle(
        accessToken,
        fromAccount.email,
        toAccount.email,
        expiryDate,
        fromAccount,
        emailContent
      );
    } else if (fromAccount.type === "outlook") {
      const accessToken = fromAccount.oauth2?.tokens?.access_token;
      if (!accessToken) {
        throw new Error("Missing access token for Outlook account");
      }

      const expiryTime = fromAccount.oauth2?.tokens?.expires_at || fromAccount.oauth2?.tokens?.expiry_date;
      result = await sendEmailFromMicrosoft(
        accessToken,
        fromAccount.email,
        toAccount.email,
        expiryTime,
        emailContent,
        fromAccount
      );
    } else if (fromAccount.type === "imap") {
      result = await sendEmailWithSMTP(fromAccount, toAccount.email, emailContent);
    } else {
      throw new Error(`Unsupported account type: ${fromAccount.type}`);
    }

    return result;
  } catch (error) {
    console.error(`❌ Error sending warmup email from ${fromAccount.email} to ${toAccount.email}:`, error.message);
    throw error;
  }
};

const countTotalEmailsToday = async (accountId) => {
  const { startOfDay, endOfDay } = getTodayRange();
  
  const warmupCount = await WarmupEmail.countDocuments({
    fromAccount: accountId,
    sentDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
    status: "sent",
  });

  return warmupCount;
};

const countRepliesToday = async (accountId) => {
  const { startOfDay, endOfDay } = getTodayRange();
  
  const count = await WarmupEmail.countDocuments({
    fromAccount: accountId,
    sentDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
    isReply: true,
    status: "sent",
  });

  return count;
};

/**
 * Process replies to inbound warmup emails
 */
const processInboundReplies = async (account) => {
  const warmup = account.warmup || {};
  
  // If dailyRampup is false, don't process any replies
  if (!warmup.dailyRampup) {
    console.log(`⏭️ ${account.email}: Skipping replies (dailyRampup is disabled)`);
    return 0;
  }
  
  const dailyReplyTarget = warmup.dailyReplyTarget || 0;

  if (dailyReplyTarget <= 0) {
    return 0;
  }

  const repliesSentToday = await countRepliesToday(account._id);
  const remainingReplies = dailyReplyTarget - repliesSentToday;

  if (remainingReplies <= 0) {
    console.log(`✅ ${account.email}: Already sent ${repliesSentToday}/${dailyReplyTarget} replies today`);
    return 0;
  }

  console.log(`📨 ${account.email}: Processing replies (${repliesSentToday}/${dailyReplyTarget} sent, ${remainingReplies} remaining)`);

  // Find inbound warmup emails
  const inboundEmails = await findInboundWarmupEmails(account, remainingReplies);
  
  let repliesSent = 0;
  for (const inboundEmail of inboundEmails) {
    if (repliesSent >= remainingReplies) break;

    try {
      await sendReplyToWarmupEmail(account, inboundEmail);
      repliesSent++;
      console.log(`✅ Sent reply from ${account.email} to ${inboundEmail.from?.[0]?.address}`);

      // Small delay between replies
      if (repliesSent < remainingReplies) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`❌ Failed to send reply from ${account.email}:`, error.message);
    }
  }

  return repliesSent;
};

const runWarmupJob = async () => {
  console.log("🔥 Starting warmup job...");

  try {
    const isWeekend = !isWeekday();
    const now = new Date();

    // Get accounts with active warmup jobs
    const warmupJobs = await WarmupJob.find({
      status: "active",
      $or: [
        { nextSendTime: { $lte: now } },
        { nextSendTime: null },
      ],
    }).populate("account");

    // Get all accounts for partner finding and backward compatibility
    const accounts = await Account.find({
      "warmup.enabled": true,
      state: "connected",
    });

    if (accounts.length < 2) {
      console.log("ℹ️ Need at least 2 accounts to run warmup.");
      return;
    }

    // Initialize warmup jobs for accounts that don't have them yet (backward compatibility)
    for (const account of accounts) {
      const existingJob = warmupJobs.find(
        (job) => job.account && job.account._id.toString() === account._id.toString()
      );
      if (!existingJob) {
        try {
          const { initializeWarmupJob } = require("./warmupJobService");
          const newJob = await initializeWarmupJob(account);
          console.log(newJob);
          warmupJobs.push(newJob);
        } catch (error) {
          console.error(`Error initializing warmup job for ${account.email}:`, error.message);
        }
      }
    }

    if (warmupJobs.length === 0) {
      console.log("ℹ️ No active warmup jobs to process.");
      return;
    }

    console.log(`📧 Found ${warmupJobs.length} active warmup job(s)`);

    const { startOfDay } = getTodayRange();
    let totalSent = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let totalReplies = 0;

    // First, process replies to inbound emails
    for (const warmupJob of warmupJobs) {
      const account = await Account.findById(warmupJob.account);
      if (!account) continue;
      
      try {
        const repliesSent = await processInboundReplies(account);
        totalReplies += repliesSent;
      } catch (error) {
        console.error(`❌ Error processing replies for ${account.email}:`, error.message);
      }
    }

    // Then, process outbound warmup emails
    for (const warmupJob of warmupJobs) {
      const account = await Account.findById(warmupJob.account);
      if (!account) continue;

      try {
        // Ensure account is populated
        if (!warmupJob.account || typeof warmupJob.account === 'string') {
          await warmupJob.populate("account");
        }
        
        // const account = warmupJob.account;
        if (!account) {
          console.log(`⏭️ Skipping: Account not found for warmup job`);
          totalSkipped++;
          continue;
        }

        // Update engagement metrics
        await updateEngagementMetrics(warmupJob);

        // Check hold conditions
        await checkHoldConditions(warmupJob);
        
        // Refresh warmup job status
        await warmupJob.populate("account");
        
        // Get account email safely
        const accountEmail = warmupJob.account?.email || account?.email || "unknown";
        
        if (warmupJob.status !== "active") {
          const holdReason = warmupJob.holdReason 
            ? ` (reason: ${warmupJob.holdReason})` 
            : "";
          console.log(`⏭️ Skipping ${accountEmail}: Job status is ${warmupJob.status}${holdReason}`);
          totalSkipped++;
          continue;
        }

        const warmup = account.warmup || {};
        
        // Skip if weekdays only is enabled and it's weekend
        if (warmup.weekdaysOnly && isWeekend) {
          console.log(`⏭️ Skipping ${account.email}: Weekend detected (weekdays only enabled)`);
          totalSkipped++;
          continue;
        }

        // Check if fast mode is enabled (for testing - bypasses time checks)
        const isFastModeEnabled = process.env.WARMUP_FAST_MODE === 'true';

        // Check if it's time to send (time distribution) - skip check in fast mode
        if (!isFastModeEnabled && warmupJob.nextSendTime && warmupJob.nextSendTime > now) {
          const minutesUntilNextSend = (warmupJob.nextSendTime - now) / (1000 * 60);
          console.log(`⏭️ Skipping ${account.email}: Next send time is ${warmupJob.nextSendTime} (${minutesUntilNextSend.toFixed(1)} min away)`);
          totalSkipped++;
          continue;
        }

        // Calculate ramp-up limit based on day in cycle
        // e.g., [3, 20] with increment 5: Day 1=3, Day 2=8, Day 3=13, Day 4=18, Day 5=20, Day 6=3 (restart)
        const rampupLimit = calculateRampupLimit(warmup, warmupJob);
        const maxEmailsPerDay = getMaxEmailsPerDay(warmup.maxEmailsPerDay); // Max cap from array
        
        // Check max emails per day limit
        const totalEmailsToday = await countTotalEmailsToday(account._id);
        
        if (rampupLimit > 0 && totalEmailsToday >= rampupLimit) {
          console.log(
            `⏭️ Skipping ${account.email}: Reached today's ramp-up limit (${totalEmailsToday}/${rampupLimit})`
          );
          totalSkipped++;
          continue;
        }

        const sentToday = await countWarmupEmailsToday(account._id);

        // Calculate random emails if randomizeEmailsPerDay is enabled
        const randomizeEmails = warmup.randomizeEmailsPerDay || 0;
        let totalAllowedEmails = rampupLimit;
        
        if (randomizeEmails > 0 && maxEmailsPerDay > 0) {
          // Add random emails on top of ramp-up limit, but don't exceed maxEmailsPerDay
          const randomEmailsToAdd = Math.floor(Math.random() * (randomizeEmails + 1));
          totalAllowedEmails = Math.min(rampupLimit + randomEmailsToAdd, maxEmailsPerDay);
        }

        if (sentToday >= totalAllowedEmails) {
          // Check if should advance to next step
          if (shouldAdvanceStep(warmupJob)) {
            await advanceToNextStep(warmupJob);
            // Schedule next send time based on interval
            const nextSend = new Date();
            nextSend.setMinutes(nextSend.getMinutes() + calculatedInterval);
            warmupJob.nextSendTime = nextSend;
            await warmupJob.save();
          } else {
            // Schedule next send time based on interval
            const nextSend = new Date();
            nextSend.setMinutes(nextSend.getMinutes() + calculatedInterval);
            warmupJob.nextSendTime = nextSend;
            await warmupJob.save();
          }
          
          console.log(
            `⏭️ Skipping ${account.email}: Already sent ${sentToday}/${totalAllowedEmails} warmup emails today (step ${warmupJob.currentStep}/${warmupJob.totalSteps})`
          );
          totalSkipped++;
          continue;
        }

        // Calculate remaining slots
        let remaining = totalAllowedEmails - sentToday;
        if (maxEmailsPerDay > 0) {
          const availableInMaxLimit = maxEmailsPerDay - totalEmailsToday;
          remaining = Math.min(remaining, availableInMaxLimit);
        }

        if (remaining <= 0) {
          console.log(
            `⏭️ Skipping ${account.email}: No remaining slots (max per day limit reached)`
          );
          totalSkipped++;
          continue;
        }

        // Calculate email sending interval based on total emails per day
        // Spread emails evenly throughout the entire day (24 hours = 1440 minutes)
        // Formula: 24 hours / emails per day = hours between each email
        // Example: 10 emails/day = 24/10 = 2.4 hours = 144 minutes between emails
        const totalDayMinutes = 24 * 60; // 1440 minutes (24 hours)
        
        // Calculate interval: total day minutes / total allowed emails
        // Minimum interval: 1 minute (no maximum cap - spread evenly across 24 hours)
        const calculatedInterval = isFastModeEnabled 
          ? 1 // Fast mode: 1 email per minute for testing
          : (totalAllowedEmails > 0 
              ? Math.max(1, Math.floor(totalDayMinutes / totalAllowedEmails))
              : 1);

        // Check if enough time has passed since last send
        const lastSentAt = warmupJob.lastSentAt;
        if (lastSentAt) {
          const minutesSinceLastSend = (now - lastSentAt) / (1000 * 60);
          if (minutesSinceLastSend < calculatedInterval) {
            // Schedule next send time
            const nextSend = new Date(lastSentAt);
            nextSend.setMinutes(nextSend.getMinutes() + calculatedInterval);
            warmupJob.nextSendTime = nextSend;
            await warmupJob.save();
            console.log(
              `⏳ ${account.email}: Waiting ${(calculatedInterval - minutesSinceLastSend).toFixed(1)} more minutes before next send (interval: ${calculatedInterval} min)`
            );
            totalSkipped++;
            continue;
          }
        }

        // Distribute sends throughout the day - send 1 email at a time per account
        const emailsToSend = Math.min(remaining, 1); // Send 1 email per run for time distribution

        console.log(
          `📬 Processing ${account.email}: ${sentToday}/${totalAllowedEmails} sent (rampup: ${rampupLimit}${randomizeEmails > 0 ? ` + random: ${randomizeEmails}` : ''}), sending ${emailsToSend} now (step ${warmupJob.currentStep}/${warmupJob.totalSteps}, interval: ${calculatedInterval} min${isFastModeEnabled ? ' [FAST MODE]' : ''})`
        );

        for (let i = 0; i < emailsToSend; i++) {
          let partnerAccount = null;
          let emailContent = null;
          
          try {
            partnerAccount = await findPartnerAccount(account, accounts);

            if (!partnerAccount) {
              console.log(
                `⚠️ No partner account found for ${account.email}. Skipping remaining slots.`
              );
              break;
            }

            // Generate email with identifier tag and custom domain tracking
            emailContent = generateWarmupEmail(
              warmup.identifierTag || "",
              warmup.customDomainTracking || false
            );

            const result = await sendWarmupEmail(account, partnerAccount, emailContent);

            const warmupEmailRecord = new WarmupEmail({
              fromAccount: account._id,
              toAccount: partnerAccount._id,
              fromEmail: account.email,
              toEmail: partnerAccount.email,
              threadId: result?.threadId || null,
              subject: emailContent.subject,
              sentDate: startOfDay,
              status: "sent",
              identifierTag: warmup.identifierTag || null,
              isReply: false,
              deliveryStatus: "pending",
            });

            await warmupEmailRecord.save();

            // Update warmup job
            warmupJob.emailsSentToday += 1;
            warmupJob.emailsSentThisStep += 1;
            warmupJob.lastSentAt = new Date();
            
            // Calculate next send time based on interval
            const nextSend = new Date();
            nextSend.setMinutes(nextSend.getMinutes() + calculatedInterval);
            warmupJob.nextSendTime = nextSend;
            
            await warmupJob.save();

            console.log(
              `✅ Sent warmup email from ${account.email} to ${partnerAccount.email} (${sentToday + i + 1}/${totalAllowedEmails})`
            );
            totalSent++;

          } catch (error) {
            console.error(
              `❌ Failed to send warmup email from ${account.email}:`,
              error.message
            );

            try {
              const warmupEmailRecord = new WarmupEmail({
                fromAccount: account._id,
                toAccount: partnerAccount?._id || null,
                toEmail: partnerAccount?.email || "unknown",
                fromEmail: account.email,
                threadId: result?.threadId || null,
                subject: emailContent?.subject || "Warmup email",
                sentDate: startOfDay,
                status: "failed",
                errorMessage: error.message,
                deliveryStatus: "failed",
              });
              await warmupEmailRecord.save();
            } catch (saveError) {
              console.error("Failed to save warmup email record:", saveError.message);
            }

            totalFailed++;
          }
        }
      } catch (error) {
        console.error(`❌ Error processing account ${account.email}:`, error.message);
        totalFailed++;
      }
    }

    console.log(
      `✅ Warmup job completed. Sent: ${totalSent}, Replies: ${totalReplies}, Skipped: ${totalSkipped}, Failed: ${totalFailed}`
    );
  } catch (error) {
    console.error("❌ Error in warmup job:", error.message);
    console.error(error.stack);
    throw error;
  }
};

module.exports = {
  runWarmupJob,
  countWarmupEmailsToday,
  countTotalEmailsToday,
  countRepliesToday,
  findPartnerAccount,
  generateWarmupEmail,
  calculateEffectiveDailyLimit,
  isWeekday,
  processInboundReplies,
  findInboundWarmupEmails,
};
