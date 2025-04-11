const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const Message = require("../models/message");
const Mailbox = require("../models/mailbox");
const Attachment = require("../models/attachment");
const { google } = require("googleapis");
const axios = require("axios");
const Account = require("../models/account");
const mongoose = require("mongoose");

const refreshOAuthToken = async (account) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const refreshToken =
    account.oauth2.tokens.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("❌ No refresh token available!");
  }

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials.access_token;
};

const saveMessagesToDatabase = async (accountId, messages) => {
  try {
    for (const message of messages) {
      const existingMessage = await Message.findOne({
        account: accountId,
        uid: message.uid,
      });

      if (existingMessage) {
        console.log(`🔄 Updating existing message: ${message.subject}`);
        await Message.updateOne({ _id: existingMessage._id }, message);
      } else {
        console.log(`✅ Saving new message: ${message.subject}`);
        await Message.create(message);
      }
    }
  } catch (error) {
    console.error("❌ Error saving messages:", error.message);
    throw error;
  }
};

const fetchAndSaveMessages = async (account, criteria) => {
  try {
    let accountObj = account;
    if (
      typeof account === "string" ||
      account instanceof mongoose.Types.ObjectId
    ) {
      accountObj = await Account.findById(account);
      if (!accountObj) {
        throw new Error(`Account not found with ID: ${account}`);
      }
    }

    // Ensure accountObj has required properties
    if (!accountObj.type) {
      throw new Error('Account object missing "type" property');
    }

    console.log(
      `🔍 Processing message fetch for ${accountObj.type} account: ${accountObj.email}`
    );

    const lastFetchTimestamp = accountObj.lastFetchTimestamp || null;
    const BATCH_SIZE = 50;
    let allMessages = [];

    if (accountObj.type === "gmail") {
      if (
        !accountObj.oauth2 ||
        !accountObj.oauth2.tokens ||
        !accountObj.oauth2.tokens.access_token
      ) {
        throw new Error("Gmail account missing OAuth credentials");
      }
      await fetchAndSaveGmailMessages(
        accountObj,
        lastFetchTimestamp,
        BATCH_SIZE
      );
    } else if (accountObj.type === "outlook") {
      if (
        !accountObj.oauth2 ||
        !accountObj.oauth2.tokens ||
        !accountObj.oauth2.tokens.access_token
      ) {
        throw new Error("Outlook account missing OAuth credentials");
      }
      await fetchAndSaveOutlookMessages(
        accountObj,
        lastFetchTimestamp,
        BATCH_SIZE
      );
    } else if (accountObj.type === "imap") {
      if (
        !accountObj.imap ||
        !accountObj.imap.host ||
        !accountObj.imap.auth ||
        !accountObj.imap.auth.user
      ) {
        throw new Error("IMAP account missing required credentials");
      }
      await fetchAndSaveIMAPMessages(
        accountObj,
        criteria,
        lastFetchTimestamp,
        BATCH_SIZE
      );
    } else {
      throw new Error(`Unsupported account type: ${accountObj.type}`);
    }

    const currentTime = new Date();
    await Account.findByIdAndUpdate(accountObj._id, {
      lastFetchTimestamp: currentTime,
    });

    return allMessages;
  } catch (err) {
    console.error(`❌ Error in fetchAndSaveMessages: ${err.message}`);
    throw err;
  }
};

const fetchAndSaveGmailMessages = async (
  account,
  lastFetchTimestamp,
  batchSize
) => {
  try {
    const accessToken = await refreshOAuthToken(account);
    if (!accessToken)
      throw new Error("Failed to refresh OAuth token for Gmail");

    // Get all mailboxes for this account
    const accountMailboxes = await Mailbox.find({ account: account._id });

    // Ensure at least INBOX exists for fallback
    let inboxMailbox = accountMailboxes.find((mb) => mb.name === "INBOX");
    if (!inboxMailbox && accountMailboxes.length > 0) {
      // If no INBOX but other mailboxes exist, use the first one as fallback
      inboxMailbox = accountMailboxes[0];
    } else if (!inboxMailbox) {
      // If no mailboxes at all, create INBOX as last resort
      inboxMailbox = await Mailbox.create({
        account: account._id,
        name: "INBOX",
        path: "INBOX",
        totalMessages: 0,
        unseenMessages: 0,
      });
      console.log(
        "Created INBOX mailbox for Gmail account as no mailboxes existed"
      );
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const listParams = { userId: "me", maxResults: batchSize };

    if (lastFetchTimestamp) {
      const timestampSeconds = Math.floor(lastFetchTimestamp.getTime() / 1000);
      listParams.q = `after:${timestampSeconds}`;
    }

    let nextPageToken = null;

    do {
      if (nextPageToken) {
        listParams.pageToken = nextPageToken;
      }
      const res = await gmail.users.messages.list(listParams);
      const messageIds = res.data.messages || [];
      if (messageIds.length === 0) break;
      const messages = [];
      for (const msg of messageIds) {
        const msgRes = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
        });

        const headers = msgRes.data.payload.headers.reduce((acc, header) => {
          acc[header.name.toLowerCase()] = header.value;
          return acc;
        }, {});

        const parseEmail = (emailString) => {
          if (!emailString) return [];
          return emailString.split(",").map((email) => {
            const match = email.match(/(.*)<(.*)>/);
            return match
              ? { name: match[1].trim(), address: match[2].trim() }
              : { address: email.trim() };
          });
        };

        let messageMailbox = inboxMailbox;
        if (msgRes.data.labelIds && msgRes.data.labelIds.length > 0) {
          const matchedMailbox = accountMailboxes.find((mb) =>
            msgRes.data.labelIds.includes(mb.path)
          );
          if (matchedMailbox) {
            messageMailbox = matchedMailbox;
          }
        }

        messages.push({
          account: account._id,
          mailbox: messageMailbox._id,
          uid: msg.id,
          subject: headers.subject || "",
          from: parseEmail(headers.from),
          to: parseEmail(headers.to),
          date: new Date(parseInt(msgRes.data.internalDate)),
          body: msgRes.data.snippet || "",
          flags: msgRes.data.labelIds || [],
          headers,
        });
      }

      await saveMessagesToDatabase(account._id, messages);
      nextPageToken = res.data.nextPageToken;
    } while (nextPageToken);
  } catch (error) {
    console.error("❌ Error fetching Gmail messages:", error.message);
    throw error;
  }
};

const fetchAndSaveOutlookMessages = async (
  account,
  lastFetchTimestamp,
  batchSize
) => {
  try {
    const accessToken = await refreshOAuthToken(account);
    if (!accessToken)
      throw new Error("❌ Failed to refresh OAuth token for Outlook");

    // Get all mailboxes for this account
    const accountMailboxes = await Mailbox.find({ account: account._id });

    // Ensure at least INBOX exists for fallback
    let inboxMailbox = accountMailboxes.find((mb) => mb.name === "INBOX");
    if (!inboxMailbox && accountMailboxes.length > 0) {
      // If no INBOX but other mailboxes exist, use the first one as fallback
      inboxMailbox = accountMailboxes[0];
    } else if (!inboxMailbox) {
      // If no mailboxes at all, create INBOX as last resort
      inboxMailbox = await Mailbox.create({
        account: account._id,
        name: "INBOX",
        path: "INBOX",
        totalMessages: 0,
        unseenMessages: 0,
      });
      console.log(
        "Created INBOX mailbox for Outlook account as no mailboxes existed"
      );
    }

    const params = { $top: batchSize };

    if (lastFetchTimestamp) {
      const formattedTime = lastFetchTimestamp.toISOString();
      params.$filter = `receivedDateTime gt ${formattedTime}`;
    }

    let nextLink = `https://graph.microsoft.com/v1.0/me/messages`;

    while (nextLink) {
      const res = await axios.get(nextLink, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params:
          nextLink === `https://graph.microsoft.com/v1.0/me/messages`
            ? params
            : {},
      });

      const messages = res.data.value || [];
      if (messages.length === 0) break;
      const formattedMessages = messages.map((msg) => {
        let messageMailbox = inboxMailbox;

        // If message has parentFolderId, try to find matching mailbox
        if (msg.parentFolderId) {
          const matchedMailbox = accountMailboxes.find(
            (mb) => mb.path === msg.parentFolderId
          );
          if (matchedMailbox) {
            messageMailbox = matchedMailbox;
          }
        }

        return {
          account: account._id,
          mailbox: messageMailbox._id,
          uid: msg.id,
          subject: msg.subject || "",
          from: msg.from?.emailAddress?.address
            ? {
                name: msg.from.emailAddress.name,
                address: msg.from.emailAddress.address,
              }
            : "",
          to:
            msg.toRecipients
              ?.map((r) =>
                r.emailAddress
                  ? {
                      name: r.emailAddress.name,
                      address: r.emailAddress.address,
                    }
                  : null
              )
              .filter(Boolean) || [],
          date: new Date(msg.receivedDateTime),
          body: msg.body?.content || "",
        };
      });

      await saveMessagesToDatabase(account._id, formattedMessages);
      nextLink = res.data["@odata.nextLink"] || null;
    }
  } catch (error) {
    console.error("❌ Error fetching Outlook messages:", error.message);
    throw error;
  }
};

const fetchAndSaveIMAPMessages = async (
  account,
  criteria,
  lastFetchTimestamp,
  batchSize
) => {
  try {
    const client = new ImapFlow({
      host: account.imap.host,
      port: account.imap.port || 993,
      secure: true,
      auth: {
        user: account.imap.auth.user,
        pass: account.imap.auth.pass,
      },
      logger: console,
    });

    await client.connect();
    console.log("✅ IMAP Connected successfully");

    const mailboxes = await Mailbox.find({ account: account._id });

    for (const mailbox of mailboxes) {
      if (mailbox.totalMessages === 0) {
        console.log(`📭 Skipping empty mailbox: ${mailbox.name}`);
        continue;
      }

      let lock;
      try {
        lock = await client.getMailboxLock(mailbox.path);
        console.log(`📂 Fetching emails from: ${mailbox.name}`);

        let searchCriteria;
        let messagesToFetch = [];

        if (lastFetchTimestamp) {
          messagesToFetch = await client.search({
            since: lastFetchTimestamp,
          });
        } else {
          const status = await client.status(mailbox.path, ["messages"]);
          const totalMessages = status.messages;
          messagesToFetch = await client.search({ all: true });
        }

        for (let i = 0; i < messagesToFetch.length; i += batchSize) {
          const batchUIDs = messagesToFetch.slice(i, i + batchSize);

          if (batchUIDs.length === 0) continue;

          const batchMessages = [];

          for await (const msg of client.fetch(
            { uid: batchUIDs },
            {
              uid: true,
              envelope: true,
              source: true,
            }
          )) {
            if (!msg.source) {
              console.warn(`⚠️ No source found for UID: ${msg.uid}`);
              continue;
            }

            console.log(`📩 Found email: ${msg.envelope.subject}`);

            const parsedMessage = await simpleParser(msg.source);
            batchMessages.push({
              account: account._id,
              mailbox: mailbox._id,
              uid: msg.uid,
              subject: parsedMessage.subject || "",
              from: parsedMessage.from?.value || [],
              to: parsedMessage.to?.value || [],
              date: parsedMessage.date || new Date(),
              body: parsedMessage.text || parsedMessage.html || "",
              flags: msg.flags || [],
            });
          }

          await saveMessagesToDatabase(account._id, batchMessages);
        }
      } catch (err) {
        console.error(
          `❌ Error processing mailbox ${mailbox.path}: ${err.message}`
        );
      } finally {
        if (lock) lock.release();
      }
    }

    await client.logout();
  } catch (err) {
    console.error("❌ Error fetching IMAP messages:", err.message);
    throw err;
  }
};

module.exports = { fetchAndSaveMessages };
