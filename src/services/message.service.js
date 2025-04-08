const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const Message = require("../models/message");
const Mailbox = require("../models/mailbox");
const Attachment = require("../models/attachment");
const { google } = require("googleapis");
const axios = require("axios");

const refreshOAuthToken = async (account) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const refreshToken = account.oauth2.tokens.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;
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
      const existingMessage = await Message.findOne({ account: accountId, uid: message.uid });

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
    let messages = [];

    if (account.type === "gmail") {
      messages = await fetchGmailMessages(account);
    } else if (account.type === "outlook") {
      messages = await fetchOutlookMessages(account);
    } else {
      messages = await fetchIMAPMessages(account, criteria);
    }

    await saveMessagesToDatabase(account._id, messages);
    console.log(`🎉 Finished fetching and saving messages for account ${account._id}`);

    return messages;
  } catch (err) {
    console.error(`❌ Error fetching messages for account ${account._id}: ${err.message}`);
    throw err;
  }
};

const fetchGmailMessages = async (account) => {
  const { default: pLimit } = await import("p-limit");

  const limit = pLimit(10);

  try {
    const accessToken = await refreshOAuthToken(account);
    if (!accessToken) throw new Error("❌ Failed to refresh OAuth token for Gmail");

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const res = await gmail.users.messages.list({ userId: "me", maxResults: 50 });

    const labelsRes = await gmail.users.labels.list({ userId: "me" });
    const labels = labelsRes.data.labels || [];

    if (!labels.length) {
      console.log("No labels found.");
      return [];
    }

    const parseEmail = (emailString) => {
      if (!emailString) return [];
      return emailString.split(",").map((email) => {
        const match = email.match(/(.*)<(.*)>/);
        return match
          ? { name: match[1].trim(), address: match[2].trim() }
          : { address: email.trim() };
      });
    };

    await Promise.all(
      labels.map(async (label) => {
        let mailbox = await Mailbox.findOneAndUpdate(
          { account: account._id, path: label.id },
          {
            $setOnInsert: {
              name: label.name,
              totalMessages: 0,
              unseenMessages: 0,
              lastFetchedAt:new Date(0)
            },
          },
          { upsert: true, new: true }
        );

        let nextPageToken = null;
        const allMessages = [];
        const lastFetchedAt = mailbox.lastFetchedAt;
        let query = "";
        if (lastFetchedAt) {
          const year = lastFetchedAt.getFullYear();
          const month = String(lastFetchedAt.getMonth() + 1).padStart(2, "0");
          const day = String(lastFetchedAt.getDate()).padStart(2, "0");
          query = `after:${year}/${month}/${day}`;
          console.log("query", query);
        } else {
          query = "";
        }
        do {
          const res = await gmail.users.messages.list({
            userId: "me",
            labelIds: [label.id],
            maxResults: 500,
            pageToken: nextPageToken,
            q: query,
          });

          nextPageToken = res.data?.nextPageToken;

          const messages = res?.data?.messages || [];
          if (messages.length === 0) {
            console.log(`No messages found for label: ${label.name}`);
            break;
          }

          const messageDetails = await Promise.allSettled(
            res?.data?.messages?.map((msg) =>
              limit(async () => {
                const msgRes = await gmail.users.messages.get({
                  userId: "me",
                  id: msg.id,
                });
                const headers =
                  msgRes.data.payload?.headers?.reduce((acc, header) => {
                    acc[header.name.toLowerCase()] = header.value;
                    return acc;
                  }, {}) || {};

                return {
                  account: account._id,
                  mailbox: mailbox._id,
                  uid: msgRes.data.id,
                  subject: headers.subject || "",
                  from: parseEmail(headers.from),
                  to: parseEmail(headers.to),
                  date: new Date(parseInt(msgRes.data.internalDate)),
                  body: msgRes.data.snippet || "",
                  flags: msgRes.data.labelIds || [],
                  headers,
                };
              })
            )
          );

          allMessages.push(
            ...messageDetails
              .filter((res) => res.status === "fulfilled")
              .map((res) => res.value)
          );
        } while (nextPageToken);

        const uids = allMessages.map((m) => m.uid);
        const existingUidsSet = new Set(
          await Message.find({
            uid: { $in: uids },
            account: account._id,
            mailbox: mailbox._id,
          }).distinct("uid")
        );

        const newMessages = allMessages.filter(
          (msg) => !existingUidsSet.has(msg.uid)
        );

        if (newMessages.length > 0) {
          try {
            await Message.insertMany(newMessages);
            console.log(
              `✅ Inserted ${newMessages.length} new messages for label ${label.name}`
            );
          } catch (err) {
            console.warn("⚠️ Some duplicates may have been skipped");
          }
        } else {
          console.log(`⚠️ No new messages to insert for label ${label.name}`);
        }
        
      })
    );

    console.log("✅ All messages fetched and saved in parallel.");
  } catch (error) {
    console.error("❌ Error fetching Gmail messages:", error.message);
    throw error;
  }
};

const fetchOutlookMessages = async (account) => {
  try {
    const accessToken = await refreshOAuthToken(account);
    if (!accessToken) throw new Error("❌ Failed to refresh OAuth token for Outlook");

    const res = await axios.get("https://graph.microsoft.com/v1.0/me/messages", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { $top: 10 },
    });

    return res.data.value.map((msg) => ({
      account: account._id,
      uid: msg.id,
      subject: msg.subject || "",
      from: msg.from?.emailAddress?.address || "",
      to: msg.toRecipients?.map((r) => r.emailAddress?.address) || [],
      date: new Date(msg.receivedDateTime),
      body: msg.body?.content || "",
    }));
  } catch (error) {
    console.error("❌ Error fetching Outlook messages:", error.message);
    throw error;
  }
};

const fetchIMAPMessages = async (account, criteria) => {
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
    let messages = [];

    for (const mailbox of mailboxes) {
      if (mailbox.totalMessages === 0) {
        console.log(`📭 Skipping empty mailbox: ${mailbox.name}`);
        continue;
      }

      let lock;
      try {
        lock = await client.getMailboxLock(mailbox.path);
        console.log(`📂 Fetching emails from: ${mailbox.name}`);

        for await (const msg of client.fetch("1:10", { uid: true, envelope: true, source: true })) {
          if (!msg.source) {
            console.warn(`⚠️ No source found for UID: ${msg.uid}`);
            continue;
          }

          console.log(`📩 Found email: ${msg.envelope.subject}`);

          const parsedMessage = await simpleParser(msg.source);
          messages.push({
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
      } catch (err) {
        console.error(`❌ Error processing mailbox ${mailbox.path}: ${err.message}`);
      } finally {
        if (lock) lock.release();
      }
    }

    await client.logout();
    return messages;
  } catch (err) {
    console.error("❌ Error fetching IMAP messages:", err.message);
    throw err;
  }
};

module.exports = { fetchAndSaveMessages ,fetchGmailMessages};
