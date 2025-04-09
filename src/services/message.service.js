const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const Message = require("../models/message");
const Mailbox = require("../models/mailbox");
const Attachment = require("../models/attachment");
const { google } = require("googleapis");
const axios = require("axios");
const Account = require("../models/account");

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
    let messages = [];
    const lastFetchTimestamp = account.lastFetchTimestamp || null;

    if (account.type === "gmail") {
      messages = await fetchGmailMessages(account, lastFetchTimestamp);
    } else if (account.type === "outlook") {
      messages = await fetchOutlookMessages(account, lastFetchTimestamp);
    } else {
      messages = await fetchIMAPMessages(account, criteria, lastFetchTimestamp);
    }

    await saveMessagesToDatabase(account._id, messages);

    
    const currentTime = new Date();
    await Account.findByIdAndUpdate(account._id, {
      lastFetchTimestamp: currentTime,
    });

    return messages;
  } catch (err) {
    throw err;
  }
};

const fetchGmailMessages = async (account, lastFetchTimestamp) => {
  try {
    const accessToken = await refreshOAuthToken(account);
    if (!accessToken)
      throw new Error("Failed to refresh OAuth token for Gmail");

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    
    const listParams = { userId: "me", maxResults: 50 };

    if (lastFetchTimestamp) {
      const timestampSeconds = Math.floor(lastFetchTimestamp.getTime() / 1000);
      listParams.q = `after:${timestampSeconds}`;
    }

    let allMessageIds = [];
    let nextPageToken = null;

    
    do {
      if (nextPageToken) {
        listParams.pageToken = nextPageToken;
      }

      const res = await gmail.users.messages.list(listParams);
      const messageIds = res.data.messages || [];
      allMessageIds = [...allMessageIds, ...messageIds];

      nextPageToken = res.data.nextPageToken;
    } while (nextPageToken);

    console.log(`📥 Total message IDs fetched: ${allMessageIds.length}`);

    const messages = [];

    for (const msg of allMessageIds) {
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

      messages.push({
        account: account._id,
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

    return messages;
  } catch (error) {
    console.error("❌ Error fetching Gmail messages:", error.message);
    throw error;
  }
};

const fetchOutlookMessages = async (account, lastFetchTimestamp) => {
  try {
    const accessToken = await refreshOAuthToken(account);
    if (!accessToken)
      throw new Error("❌ Failed to refresh OAuth token for Outlook");

    const params = { $top: 50 };

    if (lastFetchTimestamp) {
      const formattedTime = lastFetchTimestamp.toISOString();
      params.$filter = `receivedDateTime gt ${formattedTime}`;
    } else {
    }

    let allMessages = [];
    let nextLink = `https:

    
    while (nextLink) {
      const res = await axios.get(nextLink, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params:
          nextLink === `https:
            ? params
            : {}, 
      });

      const messages = res.data.value || [];
      allMessages = [...allMessages, ...messages];
      
      nextLink = res.data["@odata.nextLink"] || null;

      if (nextLink) {
        console.log(
          `📥 Fetched ${messages.length} messages, loading next page...`
        );
      }
    }

    return allMessages.map((msg) => ({
      account: account._id,
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
              ? { name: r.emailAddress.name, address: r.emailAddress.address }
              : null
          )
          .filter(Boolean) || [],
      date: new Date(msg.receivedDateTime),
      body: msg.body?.content || "",
    }));
  } catch (error) {
    console.error("❌ Error fetching Outlook messages:", error.message);
    throw error;
  }
};

const fetchIMAPMessages = async (account, criteria, lastFetchTimestamp) => {
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

        let searchCriteria;

        if (lastFetchTimestamp) {
          const formattedDate = lastFetchTimestamp.toISOString();

          
          const searchResults = await client.search({
            since: lastFetchTimestamp,
          });

          if (searchResults.length === 0) {
            continue;
          }

          searchCriteria = { uid: searchResults };
        } else {
          const status = await client.status(mailbox.path, ["messages"]);
          const totalMessages = status.messages;

          
          if (totalMessages > 100) {
            searchCriteria = totalMessages - 99 + ":" + totalMessages;
          } else {
            searchCriteria = "1:*";
          }
        }

        for await (const msg of client.fetch(searchCriteria, {
          uid: true,
          envelope: true,
          source: true,
        })) {
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
        console.error(
          `❌ Error processing mailbox ${mailbox.path}: ${err.message}`
        );
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

module.exports = { fetchAndSaveMessages };
