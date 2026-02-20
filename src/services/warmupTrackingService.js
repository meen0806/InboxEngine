const WarmupEmail = require("../models/warmupEmail");
const WarmupJob = require("../models/warmupJob");
const Account = require("../models/account");
const Message = require("../models/message");
const Mailbox = require("../models/mailbox");
const { updateEngagementMetrics, checkHoldConditions } = require("./warmupJobService");

/**
 * Track email open event
 */
const trackOpen = async (warmupEmailId) => {
  try {
    const warmupEmail = await WarmupEmail.findById(warmupEmailId);
    if (!warmupEmail) {
      throw new Error("Warmup email not found");
    }

    if (!warmupEmail.opened) {
      warmupEmail.opened = true;
      warmupEmail.openedAt = new Date();
    }
    warmupEmail.openCount += 1;
    await warmupEmail.save();

    // Update engagement metrics for the warmup job
    const warmupJob = await WarmupJob.findOne({
      account: warmupEmail.fromAccount,
    });
    if (warmupJob) {
      await updateEngagementMetrics(warmupJob);
    }

    return warmupEmail;
  } catch (error) {
    console.error("Error tracking open:", error.message);
    throw error;
  }
};

/**
 * Track email click event
 */
const trackClick = async (warmupEmailId) => {
  try {
    const warmupEmail = await WarmupEmail.findById(warmupEmailId);
    if (!warmupEmail) {
      throw new Error("Warmup email not found");
    }

    if (!warmupEmail.clicked) {
      warmupEmail.clicked = true;
      warmupEmail.clickedAt = new Date();
    }
    warmupEmail.clickCount += 1;
    await warmupEmail.save();

    // Update engagement metrics for the warmup job
    const warmupJob = await WarmupJob.findOne({
      account: warmupEmail.fromAccount,
    });
    if (warmupJob) {
      await updateEngagementMetrics(warmupJob);
    }

    return warmupEmail;
  } catch (error) {
    console.error("Error tracking click:", error.message);
    throw error;
  }
};

/**
 * Track email bounce event
 */
const trackBounce = async (warmupEmailId, bounceReason, bounceType = "soft") => {
  try {
    const warmupEmail = await WarmupEmail.findById(warmupEmailId);
    if (!warmupEmail) {
      throw new Error("Warmup email not found");
    }

    warmupEmail.deliveryStatus = "bounced";
    warmupEmail.bounceReason = bounceReason;
    warmupEmail.bounceType = bounceType;
    await warmupEmail.save();

    // Update engagement metrics and check hold conditions
    const warmupJob = await WarmupJob.findOne({
      account: warmupEmail.fromAccount,
    });
    if (warmupJob) {
      await updateEngagementMetrics(warmupJob);
      await checkHoldConditions(warmupJob);
    }

    return warmupEmail;
  } catch (error) {
    console.error("Error tracking bounce:", error.message);
    throw error;
  }
};

/**
 * Track spam complaint event
 */
const trackSpamComplaint = async (warmupEmailId) => {
  try {
    const warmupEmail = await WarmupEmail.findById(warmupEmailId);
    if (!warmupEmail) {
      throw new Error("Warmup email not found");
    }

    warmupEmail.spamComplaint = true;
    warmupEmail.spamComplaintAt = new Date();
    await warmupEmail.save();

    // Update engagement metrics and check hold conditions
    const warmupJob = await WarmupJob.findOne({
      account: warmupEmail.fromAccount,
    });
    if (warmupJob) {
      await updateEngagementMetrics(warmupJob);
      await checkHoldConditions(warmupJob);
    }

    return warmupEmail;
  } catch (error) {
    console.error("Error tracking spam complaint:", error.message);
    throw error;
  }
};

/**
 * Track delivery status update
 */
const trackDeliveryStatus = async (
  warmupEmailId,
  deliveryStatus,
  landedInInbox = false,
  savedFromSpam = false
) => {
  try {
    const warmupEmail = await WarmupEmail.findById(warmupEmailId);
    if (!warmupEmail) {
      throw new Error("Warmup email not found");
    }

    warmupEmail.deliveryStatus = deliveryStatus;
    warmupEmail.landedInInbox = landedInInbox;
    warmupEmail.savedFromSpam = savedFromSpam;
    warmupEmail.checkedAt = new Date();
    await warmupEmail.save();

    // Update engagement metrics for the warmup job
    const warmupJob = await WarmupJob.findOne({
      account: warmupEmail.fromAccount,
    });
    if (warmupJob) {
      await updateEngagementMetrics(warmupJob);
    }

    return warmupEmail;
  } catch (error) {
    console.error("Error tracking delivery status:", error.message);
    throw error;
  }
};

/**
 * Find warmup email by identifier tag and to email
 */
const findWarmupEmailByTag = async (identifierTag, toEmail) => {
  try {
    const warmupEmail = await WarmupEmail.findOne({
      identifierTag: identifierTag,
      toEmail: toEmail.toLowerCase(),
      status: "sent",
    }).sort({ sentAt: -1 });

    return warmupEmail;
  } catch (error) {
    console.error("Error finding warmup email by tag:", error.message);
    throw error;
  }
};

/**
 * Monitor replies by checking for identifier tag in messages
 */
const monitorReplies = async (account, messages) => {
  try {
    const warmup = account.warmup || {};
    const identifierTag = warmup.identifierTag || "";

    if (!identifierTag) {
      return [];
    }

    const replies = [];
    const tagLower = identifierTag.toLowerCase();

    for (const message of messages) {
      const body = (message.body || "").toLowerCase();
      const subject = (message.subject || "").toLowerCase();

      if (body.includes(tagLower) || subject.includes(tagLower)) {
        // Find the corresponding warmup email
        const fromEmail = message.from?.[0]?.address?.toLowerCase() || "";
        const warmupEmail = await WarmupEmail.findOne({
          toAccount: account._id,
          fromEmail: fromEmail,
          identifierTag: identifierTag,
          status: "sent",
        }).sort({ sentAt: -1 });

        if (warmupEmail && !warmupEmail.isReply) {
          // Mark the original warmup email as replied
          warmupEmail.status = "replied";
          warmupEmail.repliedAt = new Date();
          await warmupEmail.save();

          replies.push({
            message: message,
            warmupEmail: warmupEmail,
          });
        }
      }
    }

    return replies;
  } catch (error) {
    console.error("Error monitoring replies:", error.message);
    throw error;
  }
};

/**
 * Detect bounces from message analysis
 */
const detectBounces = async (account, messages) => {
  try {
    const bounces = [];
    const bounceKeywords = [
      "bounce",
      "undeliverable",
      "delivery failure",
      "mailbox full",
      "recipient not found",
      "address not found",
      "user unknown",
      "mailbox unavailable",
    ];

    for (const message of messages) {
      const subject = (message.subject || "").toLowerCase();
      const body = (message.body || "").toLowerCase();

      const isBounce = bounceKeywords.some(
        (keyword) => subject.includes(keyword) || body.includes(keyword)
      );

      if (isBounce) {
        // Try to find the corresponding warmup email
        const toEmail = message.to?.[0]?.address?.toLowerCase() || "";
        const warmupEmail = await WarmupEmail.findOne({
          fromAccount: account._id,
          toEmail: toEmail,
          status: "sent",
          deliveryStatus: { $ne: "bounced" },
        }).sort({ sentAt: -1 });

        if (warmupEmail) {
          // Determine bounce type
          const isHardBounce =
            subject.includes("permanent") ||
            body.includes("permanent") ||
            subject.includes("550") ||
            body.includes("550") ||
            subject.includes("user unknown") ||
            body.includes("user unknown") ||
            subject.includes("address not found") ||
            body.includes("address not found");

          await trackBounce(
            warmupEmail._id,
            message.body || message.subject || "Bounce detected",
            isHardBounce ? "hard" : "soft"
          );

          bounces.push({
            message: message,
            warmupEmail: warmupEmail,
            bounceType: isHardBounce ? "hard" : "soft",
          });
        }
      }
    }

    return bounces;
  } catch (error) {
    console.error("Error detecting bounces:", error.message);
    throw error;
  }
};

/**
 * Detect spam complaints from message analysis
 */
const detectSpamComplaints = async (account, messages) => {
  try {
    const complaints = [];
    const complaintKeywords = [
      "spam complaint",
      "abuse report",
      "spam report",
      "complaint",
      "abuse",
    ];

    for (const message of messages) {
      const subject = (message.subject || "").toLowerCase();
      const body = (message.body || "").toLowerCase();

      const isComplaint = complaintKeywords.some(
        (keyword) => subject.includes(keyword) || body.includes(keyword)
      );

      if (isComplaint) {
        // Try to find the corresponding warmup email
        const toEmail = message.to?.[0]?.address?.toLowerCase() || "";
        const warmupEmail = await WarmupEmail.findOne({
          fromAccount: account._id,
          toEmail: toEmail,
          status: "sent",
          spamComplaint: false,
        }).sort({ sentAt: -1 });

        if (warmupEmail) {
          await trackSpamComplaint(warmupEmail._id);

          complaints.push({
            message: message,
            warmupEmail: warmupEmail,
          });
        }
      }
    }

    return complaints;
  } catch (error) {
    console.error("Error detecting spam complaints:", error.message);
    throw error;
  }
};

/**
 * Check if a mailbox is a spam/junk folder
 */
const isSpamMailbox = (mailbox) => {
  if (!mailbox) return false;
  const name = (mailbox.name || "").toLowerCase();
  const path = (mailbox.path || "").toLowerCase();
  
  const spamKeywords = ["spam", "junk", "bulk"];
  return spamKeywords.some(keyword => name.includes(keyword) || path.includes(keyword));
};

/**
 * Check if a Gmail message is in spam (by labelIds)
 */
const isGmailSpam = (message) => {
  if (!message.flags || !Array.isArray(message.flags)) return false;
  return message.flags.includes("SPAM") || message.flags.some(flag => 
    typeof flag === "string" && flag.toLowerCase().includes("spam")
  );
};

/**
 * Detect and track delivery status for all warmup emails from a specific account
 * @param {string} accountId - Account ID to check warmup emails for
 * @param {number} hoursToCheck - How many hours back to check (default: 30 days)
 * @param {boolean} onlyPending - If true, only check pending emails. If false, check all emails
 */
const detectDeliveryStatusForAccount = async (accountId, hoursToCheck = 24 * 30, onlyPending = false) => {
  try {
    const account = await Account.findById(accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    const now = new Date();
    const checkFrom = new Date(now.getTime() - hoursToCheck * 60 * 60 * 1000);

    // Build query for warmup emails from this account
    const query = {
      fromAccount: accountId,
      status: "sent",
      sentAt: { $gte: checkFrom },
    };

    // Optionally filter to only pending emails
    if (onlyPending) {
      query.deliveryStatus = "pending";
    }

    const warmupEmails = await WarmupEmail.find(query)
      .populate("toAccount")
      .populate("fromAccount");

    if (warmupEmails.length === 0) {
      console.log(`📭 No warmup emails found for account ${account.email}`);
      return { checked: 0, updated: 0, accountEmail: account.email };
    }

    console.log(`🔍 Checking delivery status for ${warmupEmails.length} warmup emails from ${account.email}`);

    let checked = 0;
    let updated = 0;

    // Group by recipient account to minimize API calls
    const emailsByRecipient = {};
    for (const warmupEmail of warmupEmails) {
      if (!warmupEmail.toAccount || !warmupEmail.toAccount._id) continue;
      const recipientId = warmupEmail.toAccount._id.toString();
      if (!emailsByRecipient[recipientId]) {
        emailsByRecipient[recipientId] = [];
      }
      emailsByRecipient[recipientId].push(warmupEmail);
    }

    // Check each recipient account
    for (const [recipientId, emails] of Object.entries(emailsByRecipient)) {
      try {
        const recipientAccount = await Account.findById(recipientId);
        if (!recipientAccount || recipientAccount.state !== "active") {
          console.log(`⏭️ Skipping recipient ${recipientId}: Account not connected`);
          continue;
        }

        console.log(`📬 Checking ${emails.length} emails for recipient: ${recipientAccount.email}`);

        // Get recent messages from this recipient account
        let recentMessages = await Message.find({
          account: recipientAccount._id,
          date: { $gte: checkFrom },
        }).populate("mailbox").limit(2000);
        
        console.log(`📧 Found ${recentMessages.length} messages in recipient account ${recipientAccount.email} (checking from ${checkFrom.toISOString()})`);
        
        // If no messages found, try to fetch them
        if (recentMessages.length === 0) {
          console.log(`⚠️ No messages found for recipient ${recipientAccount.email}. Attempting to fetch messages...`);
          try {
            const { fetchAndSaveMessages } = require("./message.service");
            await fetchAndSaveMessages(recipientAccount, {});
            
            // Try again after fetching
            recentMessages = await Message.find({
              account: recipientAccount._id,
              date: { $gte: checkFrom },
            }).populate("mailbox").limit(2000);
            
            console.log(`📧 After fetching, found ${recentMessages.length} messages in recipient account ${recipientAccount.email}`);
          } catch (fetchError) {
            console.error(`❌ Failed to fetch messages for recipient ${recipientAccount.email}:`, fetchError.message);
            console.log(`⚠️ Please manually sync messages for ${recipientAccount.email} to track delivery status`);
          }
        }

        // Get mailboxes for this account
        const mailboxes = await Mailbox.find({ account: recipientAccount._id });
        const mailboxMap = new Map(mailboxes.map(mb => [mb._id.toString(), mb]));

        // Check each warmup email
        for (const warmupEmail of emails) {
          checked++;
          const identifierTag = warmupEmail.identifierTag || "";
          const fromEmail = warmupEmail.fromEmail?.toLowerCase() || "";
          const subject = warmupEmail.subject || "";

          // Try to find matching message
          let matchedMessage = null;
          let matchReason = "";
          
          for (const message of recentMessages) {
            const msgFrom = message.from?.[0]?.address?.toLowerCase() || "";
            const msgSubject = (message.subject || "").toLowerCase();
            const msgBody = (message.body || "").toLowerCase();
            const tagLower = identifierTag.toLowerCase();
            const subjectLower = (subject || "").toLowerCase();

            // Match by identifier tag (highest priority)
            const matchesTag = identifierTag && (
              msgSubject.includes(tagLower) || 
              msgBody.includes(tagLower)
            );
            
            // Match by from email
            const matchesEmail = fromEmail && msgFrom === fromEmail;
            
            // Match by subject (check if subjects are similar)
            const matchesSubject = subject && (
              msgSubject.includes(subjectLower.substring(0, 30)) ||
              subjectLower.includes(msgSubject.substring(0, 30))
            );

            // Match by from email + date (within 5 minutes of sent time)
            const messageDate = new Date(message.date);
            const sentDate = new Date(warmupEmail.sentAt);
            const timeDiff = Math.abs(messageDate - sentDate) / (1000 * 60); // minutes
            const matchesDate = matchesEmail && timeDiff <= 5;

            // Priority: tag > (email + subject) > (email + date)
            if (matchesTag) {
              matchedMessage = message;
              matchReason = "identifier_tag";
              break;
            } else if (matchesEmail && matchesSubject) {
              matchedMessage = message;
              matchReason = "email_and_subject";
              break;
            } else if (matchesDate) {
              matchedMessage = message;
              matchReason = "email_and_date";
              break;
            }
          }
          
          if (!matchedMessage) {
            console.log(`⚠️ No match found for warmup email ${warmupEmail._id} from ${fromEmail} to ${recipientAccount.email} (tag: ${identifierTag}, subject: ${subject.substring(0, 30)})`);
          }

          if (matchedMessage) {
            // Get mailbox - it might be populated (object) or just an ObjectId
            let mailbox = null;
            if (matchedMessage.mailbox) {
              if (matchedMessage.mailbox._id) {
                // Already populated, use it directly
                mailbox = matchedMessage.mailbox;
              } else {
                // Just an ObjectId, look it up in the map
                mailbox = mailboxMap.get(matchedMessage.mailbox.toString());
              }
            }
            
            const isInSpam = recipientAccount.type === "gmail" 
              ? isGmailSpam(matchedMessage)
              : isSpamMailbox(mailbox);

            // Determine delivery status
            let deliveryStatus = "delivered";
            let landedInInbox = warmupEmail.landedInInbox || false;
            let savedFromSpam = warmupEmail.savedFromSpam || false;

            if (isInSpam) {
              deliveryStatus = "spam";
            } else {
              // Check if mailbox is inbox - handle various naming conventions
              const mailboxName = mailbox?.name || "";
              const mailboxPath = mailbox?.path || "";
              const nameLower = mailboxName.toLowerCase();
              const pathLower = mailboxPath.toLowerCase();
              
              const isInbox = mailbox && (
                mailboxName === "INBOX" || 
                nameLower === "inbox" ||
                mailboxPath === "INBOX" ||
                pathLower === "inbox" ||
                pathLower === "/inbox" ||
                nameLower.includes("inbox") && !nameLower.includes("spam") && !nameLower.includes("junk")
              );

              if (isInbox) {
                deliveryStatus = "inbox";
                // If it was previously in spam and now in inbox, mark as saved from spam
                if (warmupEmail.deliveryStatus === "spam") {
                  savedFromSpam = true;
                }
                landedInInbox = true;
              } else {
                deliveryStatus = "delivered";
                // Log mailbox info for debugging
                if (mailbox) {
                  console.log(`📬 Email in mailbox: name="${mailboxName}", path="${mailboxPath}" (not detected as inbox)`);
                } else {
                  console.log(`⚠️ No mailbox found for matched message`);
                }
              }
            }

            // Update warmup email
            const previousStatus = warmupEmail.deliveryStatus;
            const wasInSpam = previousStatus === "spam";
            
            // If it was in spam before and now in inbox, mark as saved from spam
            if (wasInSpam && deliveryStatus === "inbox") {
              savedFromSpam = true;
              landedInInbox = true;
            } else if (!wasInSpam && deliveryStatus === "inbox") {
              // First time detected in inbox
              landedInInbox = true;
            }

            await trackDeliveryStatus(
              warmupEmail._id,
              deliveryStatus,
              landedInInbox,
              savedFromSpam
            );

            updated++;
            console.log(
              `✅ Updated delivery status for warmup email ${warmupEmail._id}: ${previousStatus} → ${deliveryStatus} (inbox: ${landedInInbox}, savedFromSpam: ${savedFromSpam}, matched by: ${matchReason})`
            );
          } else {
            // Email not found in recipient's inbox - might not be delivered yet
            // Only update if it's been more than 1 hour since sent
            const hoursSinceSent = (now - warmupEmail.sentAt) / (1000 * 60 * 60);
            if (hoursSinceSent > 1 && warmupEmail.deliveryStatus === "pending") {
              // Mark as delivered (generic) if we can't find it
              await trackDeliveryStatus(
                warmupEmail._id,
                "delivered",
                false,
                false
              );
              updated++;
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error checking recipient ${recipientId}:`, error.message);
        continue;
      }
    }

    console.log(`✅ Delivery status check complete for ${account.email}: ${updated}/${checked} emails updated`);
    return { checked, updated, accountEmail: account.email };
  } catch (error) {
    console.error("Error detecting delivery status for account:", error.message);
    throw error;
  }
};

/**
 * Automatically detect and track delivery status for warmup emails
 * Checks recipient accounts' inboxes and spam folders
 */
const detectDeliveryStatus = async (hoursToCheck = 24) => {
  try {
    const now = new Date();
    const checkFrom = new Date(now.getTime() - hoursToCheck * 60 * 60 * 1000);

    // Get pending warmup emails sent in the last N hours
    const pendingWarmupEmails = await WarmupEmail.find({
      status: "sent",
      deliveryStatus: "pending",
      sentAt: { $gte: checkFrom },
    }).populate("toAccount").populate("fromAccount");

    if (pendingWarmupEmails.length === 0) {
      console.log("📭 No pending warmup emails to check for delivery status");
      return { checked: 0, updated: 0 };
    }

    let checked = 0;
    let updated = 0;

    // Group by recipient account to minimize API calls
    const emailsByRecipient = {};
    for (const warmupEmail of pendingWarmupEmails) {
      if (!warmupEmail.toAccount || !warmupEmail.toAccount._id) continue;
      const recipientId = warmupEmail.toAccount._id.toString();
      if (!emailsByRecipient[recipientId]) {
        emailsByRecipient[recipientId] = [];
      }
      emailsByRecipient[recipientId].push(warmupEmail);
    }

    // Check each recipient account
    for (const [recipientId, warmupEmails] of Object.entries(emailsByRecipient)) {
      try {
        const recipientAccount = await Account.findById(recipientId);
          if (!recipientAccount || recipientAccount.state !== "active") {
          console.log(`⏭️ Skipping recipient ${recipientId}: Account not connected`);
          continue;
        }

        console.log(`📬 Checking ${warmupEmails.length} emails for recipient: ${recipientAccount.email}`);

        // Get recent messages from this account
        const recentMessages = await Message.find({
          account: recipientAccount._id,
          date: { $gte: checkFrom },
        }).populate("mailbox").limit(1000);

        // Get mailboxes for this account
        const mailboxes = await Mailbox.find({ account: recipientAccount._id });
        const mailboxMap = new Map(mailboxes.map(mb => [mb._id.toString(), mb]));

        // Check each warmup email
        for (const warmupEmail of warmupEmails) {
          checked++;
          const identifierTag = warmupEmail.identifierTag || "";
          const fromEmail = warmupEmail.fromEmail?.toLowerCase() || "";
          const subject = warmupEmail.subject || "";

          // Try to find matching message
          let matchedMessage = null;
          let matchReason = "";
          
          for (const message of recentMessages) {
            const msgFrom = message.from?.[0]?.address?.toLowerCase() || "";
            const msgSubject = (message.subject || "").toLowerCase();
            const msgBody = (message.body || "").toLowerCase();
            const tagLower = identifierTag.toLowerCase();
            const subjectLower = (subject || "").toLowerCase();

            // Match by identifier tag (highest priority)
            const matchesTag = identifierTag && (
              msgSubject.includes(tagLower) || 
              msgBody.includes(tagLower)
            );
            
            // Match by from email
            const matchesEmail = fromEmail && msgFrom === fromEmail;
            
            // Match by subject (check if subjects are similar)
            const matchesSubject = subject && (
              msgSubject.includes(subjectLower.substring(0, 30)) ||
              subjectLower.includes(msgSubject.substring(0, 30))
            );

            // Match by from email + date (within 5 minutes of sent time)
            const messageDate = new Date(message.date);
            const sentDate = new Date(warmupEmail.sentAt);
            const timeDiff = Math.abs(messageDate - sentDate) / (1000 * 60); // minutes
            const matchesDate = matchesEmail && timeDiff <= 5;

            // Priority: tag > (email + subject) > (email + date)
            if (matchesTag) {
              matchedMessage = message;
              matchReason = "identifier_tag";
              break;
            } else if (matchesEmail && matchesSubject) {
              matchedMessage = message;
              matchReason = "email_and_subject";
              break;
            } else if (matchesDate) {
              matchedMessage = message;
              matchReason = "email_and_date";
              break;
            }
          }
          
          if (!matchedMessage) {
            console.log(`⚠️ No match found for warmup email ${warmupEmail._id} from ${fromEmail} to ${recipientAccount.email} (tag: ${identifierTag}, subject: ${subject.substring(0, 30)})`);
          }

          if (matchedMessage) {
            // Get mailbox - it might be populated (object) or just an ObjectId
            let mailbox = null;
            if (matchedMessage.mailbox) {
              if (matchedMessage.mailbox._id) {
                // Already populated, use it directly
                mailbox = matchedMessage.mailbox;
              } else {
                // Just an ObjectId, look it up in the map
                mailbox = mailboxMap.get(matchedMessage.mailbox.toString());
              }
            }
            
            const isInSpam = recipientAccount.type === "gmail" 
              ? isGmailSpam(matchedMessage)
              : isSpamMailbox(mailbox);

            // Determine delivery status
            let deliveryStatus = "delivered";
            let landedInInbox = false;
            let savedFromSpam = false;

            if (isInSpam) {
              deliveryStatus = "spam";
              // Check if it was previously in spam but now moved to inbox
              // For now, we'll mark as spam. If it moves later, we can detect that separately
            } else {
              // Check if mailbox is inbox - handle various naming conventions
              const mailboxName = mailbox?.name || "";
              const mailboxPath = mailbox?.path || "";
              const nameLower = mailboxName.toLowerCase();
              const pathLower = mailboxPath.toLowerCase();
              
              const isInbox = mailbox && (
                mailboxName === "INBOX" || 
                nameLower === "inbox" ||
                mailboxPath === "INBOX" ||
                pathLower === "inbox" ||
                pathLower === "/inbox" ||
                nameLower.includes("inbox") && !nameLower.includes("spam") && !nameLower.includes("junk")
              );

              if (isInbox) {
                deliveryStatus = "inbox";
                landedInInbox = true;
              } else {
                deliveryStatus = "delivered";
                // Log mailbox info for debugging
                if (mailbox) {
                  console.log(`📬 Email in mailbox: name="${mailboxName}", path="${mailboxPath}" (not detected as inbox)`);
                } else {
                  console.log(`⚠️ No mailbox found for matched message`);
                }
              }
            }

            // Update warmup email
            const previousStatus = warmupEmail.deliveryStatus;
            const wasInSpam = previousStatus === "spam";
            
            // If it was in spam before and now in inbox, mark as saved from spam
            if (wasInSpam && deliveryStatus === "inbox") {
              savedFromSpam = true;
              landedInInbox = true;
            } else if (!wasInSpam && deliveryStatus === "inbox") {
              // First time detected in inbox
              landedInInbox = true;
            }

            await trackDeliveryStatus(
              warmupEmail._id,
              deliveryStatus,
              landedInInbox,
              savedFromSpam
            );

            updated++;
            console.log(
              `✅ Updated delivery status for warmup email ${warmupEmail._id}: ${previousStatus} → ${deliveryStatus} (inbox: ${landedInInbox}, savedFromSpam: ${savedFromSpam}, matched by: ${matchReason})`
            );
          }
        }
      } catch (error) {
        console.error(`❌ Error checking recipient ${recipientId}:`, error.message);
        continue;
      }
    }

    console.log(`✅ Delivery status check complete: ${updated}/${checked} emails updated`);
    return { checked, updated };
  } catch (error) {
    console.error("Error detecting delivery status:", error.message);
    throw error;
  }
};

module.exports = {
  trackOpen,
  trackClick,
  trackBounce,
  trackSpamComplaint,
  trackDeliveryStatus,
  findWarmupEmailByTag,
  monitorReplies,
  detectBounces,
  detectSpamComplaints,
  detectDeliveryStatus,
  detectDeliveryStatusForAccount,
};

