const mongoose = require("mongoose");
const { verifyAccountCallback } = require("../callbacks/accountCallback");
const { sendEmailFromGoogle, sendEmailWithSMTP } = require("../util/sendEmail");

const accountSchema = new mongoose.Schema({
  account: { type: String },
  name: { type: String, required: true },
  email: { type: String },
  orgId: { type: String, required: true },
  type: { type: String, enum: ["smtp", "gmail", "outlook", "imap"], required: true },
  state: { type: String, enum: ["active", "inactive", "error"] },
  path: [{ type: String }],
  subconnections: [{ type: String }],
  webhooks: { type: String },
  copy: { type: Boolean },
  limit: { type: Number, default: 0 },
  time_gap: { type: Number, default: 0 },
  last_sent: { type: Date, default: null },
  logs: { type: Boolean, default: false },
  notifyFrom: { type: Date, default: Date.now },
  lastFetchTimestamp: { type: Date, default: null },
  proxy: { type: String },
  smtpEhloName: { type: String },
  imapIndexer: { type: String, enum: ["full", "fast"] },
  imap: {
    auth: {
      user: {
        type: String,
        validate: {
          validator: function (value) {
            return this.oauth2.authorize !== true || !!value;
          },
          message: "IMAP auth.user is required when oauth2.authorize is false",
        },
      },
      pass: {
        type: String,
        validate: {
          validator: function (value) {
            return this.oauth2.authorize !== true || !!value;
          },
          message: "IMAP auth.pass is required when oauth2.authorize is false",
        },
      },
    },
    host: {
      type: String,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || !!value;
        },
        message: "IMAP host is required when oauth2.authorize is false",
      },
    },
    port: {
      type: Number,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || !!value;
        },
        message: "IMAP port is required when oauth2.authorize is false",
      },
    },
    secure: {
      type: Boolean,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || value !== undefined;
        },
        message: "IMAP secure is required when oauth2.authorize is false",
      },
    },
  },
  smtp: {
    auth: {
      user: {
        type: String,
        validate: {
          validator: function (value) {
            return this.oauth2.authorize !== true || !!value;
          },
          message: "SMTP auth.user is required when oauth2.authorize is false",
        },
      },
      pass: {
        type: String,
        validate: {
          validator: function (value) {
            return this.oauth2.authorize !== true || !!value;
          },
          message: "SMTP auth.pass is required when oauth2.authorize is false",
        },
      },
    },
    host: {
      type: String,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || !!value;
        },
        message: "SMTP host is required when oauth2.authorize is false",
      },
    },
    port: {
      type: Number,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || !!value;
        },
        message: "SMTP port is required when oauth2.authorize is false",
      },
    },
    secure: {
      type: Boolean,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || value !== undefined;
        },
        message: "SMTP secure is required when oauth2.authorize is false",
      },
    },
  },
  oauth2: {
    authorize: { type: Boolean },
    clientId: { type: String },
    clientSecret: { type: String },
    redirectUri: { type: String },
    tokens: { type: Object },
  },
  webhooksCustomHeaders: [
    {
      key: { type: String },
      value: { type: String },
    },
  ],
  locale: { type: String },
  tz: { type: String },
  accessToken: { type: String },
  refreshToken: { type: String },
  warmup: {
    enabled: { type: Boolean, default: false },
    maxPerDay: { type: Number, default: 20 },
    dailyRampup: { type: Boolean, default: false },
    rampupIncrement: { type: Number, default: 5 },
    startDate: { type: Date, default: null },
    maxEmailsPerDay: { type: Array, default: [0, 0] }, // Maximum number of emails that could be sent via this email account per day [min, max]
    randomizeEmailsPerDay: { type: Number, default: 0 }, // Randomize number of warm-up emails per day (additional random emails on top of warmup emails)
    replyRate: { type: Number, default: 20, min: 0, max: 100 }, // Reply Rate (%) - Suggested 20, Maximum 100
    dailyReplyTarget: { type: Number, default: 0 }, // Daily Target for Replies to Inbound Warmup Emails (min: maxPerDay, max: 100/all)
    identifierTag: { type: String, default: "" }, // Custom Warmup Identifier Tag (two-worded tag like "where-final")
    autoAdjust: { type: Boolean, default: false }, // Enable Auto-adjust warmup/sending ratio
    customDomainTracking: { type: Boolean, default: false }, // Warmup the Custom Domain tracking Link
    weekdaysOnly: { type: Boolean, default: false }, // Send warmup emails only on weekdays
    reputation: { type: Number, default: 100, min: 0, max: 100 }, // Email reputation score (0-100)
    reputationLastCalculated: { type: Date, default: null },
  },
  createdAt: { type: Date, default: Date.now },
});

accountSchema.pre("save", async function (next) {
  try {
    const result = await verifyAccountCallback(this);

    if (result.success) {
      this.state = "active";
    } else {
      this.state = "error";
      this.smtpEhloName = result.message;
    }

    next();
  } catch (err) {
    next(err);
  }
});

accountSchema.post("save", async function (account) {
  try {
    // First validate account properties to avoid "Cannot read properties of undefined" errors
    const hasOAuthCredentials =
      account.oauth2 &&
      account.oauth2.tokens &&
      account.oauth2.tokens.access_token;
    const hasImapCredentials =
      account.imap && account.imap.auth && account.imap.auth.user;

    if (account.state === "active") {
      try {
        const { fetchAndSaveMailboxes } = require("../services/mailboxService");

        // Skip if missing credentials
        if (
          (account.type === "gmail" || account.type === "outlook") &&
          !hasOAuthCredentials
        ) {
          console.log(
            `⚠️ Skipping mailbox/message fetch for ${account.email}: Missing OAuth credentials`
          );
          return;
        } else if (account.type === "imap" && !hasImapCredentials) {
          console.log(
            `⚠️ Skipping mailbox/message fetch for ${account.email}: Missing IMAP credentials`
          );
          return;
        }

        console.log(`🔄 Fetching mailboxes for account: ${account.email}`);
        await fetchAndSaveMailboxes(account);
        console.log(
          `✅ Successfully fetched mailboxes for account: ${account.email}`
        );

        const accountId = account._id.toString();

        setImmediate(async () => {
          try {
            // Get the required services for fetching messages
            const messageService = require("../services/message.service");
            const Account = mongoose.model("Account");

            const refreshedAccount = await Account.findById(accountId);

            if (!refreshedAccount) {
              console.error(
                `❌ Could not re-fetch account ${account.email} for message fetching`
              );
              return;
            }

            console.log(
              `🔄 Starting background fetch of messages for ${refreshedAccount.type} account: ${refreshedAccount.email}`
            );

            await messageService.fetchAndSaveMessages(refreshedAccount, {});

            console.log(
              `✅ Successfully completed background fetch of messages for account: ${refreshedAccount.email}`
            );

            await Account.findByIdAndUpdate(accountId, {
              lastFetchTimestamp: new Date(),
            });

            console.log(
              `📅 Updated lastFetchTimestamp for account: ${refreshedAccount.email}`
            );
          } catch (bgFetchError) {
            console.error(
              `❌ Error in background message fetching for account ${account.email}:`,
              bgFetchError.message
            );
            console.error(bgFetchError.stack);
          }
        });
      } catch (fetchError) {
        console.error(
          `❌ Error fetching mailboxes for account ${account.email}:`,
          fetchError.message
        );
        console.error(fetchError.stack);
      }
    }
  } catch (error) {
    console.error(
      `❌ Error in post-save processing for account ${account.email}:`,
      error.message
    );
    console.error(error.stack);
  }
});

const Account = mongoose.model("Account", accountSchema);

module.exports = Account;
