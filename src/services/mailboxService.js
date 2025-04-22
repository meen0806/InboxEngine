const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const Message = require("../models/message");
const Mailbox = require("../models/mailbox");
const { google } = require("googleapis");
const outlookService = require("./outlookService");

async function openMailboxSafely(client, mailbox) {
  const mailboxes = await client.list();
  const mailboxExists = mailboxes.some((m) => m.path === mailbox);

  if (!mailboxExists) {
    console.warn(`⚠️ Skipping non-existent mailbox: ${mailbox}`);
    return false;
  }

  await client.mailboxOpen(mailbox);
  return true;
}

const refreshOAuthToken = async (account) => {
  if (account.type === "gmail") {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  
    const refreshToken =
      account.oauth2.tokens.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) {
      throw new Error("No refresh token available!");
    }
  
    oauth2Client.setCredentials({ refresh_token: refreshToken });
  
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials.access_token;
  } else if (account.type === "outlook") {
    const tokens = await outlookService.refreshMicrosoftOAuthToken(account);
    return tokens.access_token;
  } else {
    throw new Error(`Unsupported account type: ${account.type}`);
  }
};

const fetchAndSaveMessages = async (account, criteria) => {
  try {
    if (account.type === "outlook") {
      console.log(`Using Microsoft Graph API for Outlook account: ${account.email}`);
      const mailboxes = await Mailbox.find({ account: account._id });
      let totalFetched = 0;
      
      for (const mailbox of mailboxes) {
        if (mailbox.totalMessages === 0) {
          console.log(`Skipping empty mailbox: ${mailbox.name}`);
          continue;
        }
        
        try {
          const messageCount = await fetchAndSaveOutlookMessages(account, mailbox, 10);
          totalFetched += messageCount;
          console.log(`Fetched ${messageCount} messages from ${mailbox.name}`);
        } catch (err) {
          console.error(`Error fetching Outlook messages from ${mailbox.name}: ${err.message}`);
        }
      }
      
      console.log(`Finished fetching ${totalFetched} messages for Outlook account ${account.email}`);
      return;
    }

    if (account.type === "gmail") {
      const accessToken = await refreshOAuthToken(account);
      account.imap.auth = { user: account.imap.auth.user, accessToken };
    }

    const { imap, type } = account;
    const imapConfig =
      type === "gmail" ? {
        host: "imap.gmail.com",
        port: 993,
        secure: true,
        auth: account.imap.auth,
      } : {
        host: imap.host,
        port: imap.port,
        secure: imap.secure,
        auth: imap.auth,
      };

    const client = new ImapFlow(imapConfig);
    await client.connect();
    console.log("✅ Connected to IMAP Server");

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

        let count = 0;
        for await (const msg of client.fetch("1:10", {
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
          const newMessage = new Message({
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

          await newMessage.save();
          console.log(`✅ Saved message: ${newMessage.uid}`);

          count++;
          if (count >= 10) break;
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
    console.log(`🎉 Finished fetching messages for account ${account.account}`);
  } catch (err) {
    console.error(
      `❌ Error fetching messages for account ${account.account}: ${err.message}`
    );
  }
};

const fetchAndSaveMailboxes = async (accountDetails) => {
  switch (accountDetails.type) {
    case "gmail":
      return await fetchAndSaveGmailMailboxes(accountDetails);
    case "outlook":
      return await fetchAndSaveOutlookMailboxes(accountDetails);
    default:
      return await fetchAndSaveIMAPMailboxes(accountDetails);
  }
};

const saveMailboxes = async (accountId, mailboxes) => {
  try {
    for (const mailbox of mailboxes) {
      const existingMailbox = await Mailbox.findOne({
        account: accountId,
        path: mailbox.path,
      });

      if (existingMailbox) {
        if (
          existingMailbox.totalMessages !== mailbox.totalMessages ||
          existingMailbox.unseenMessages !== mailbox.unseenMessages
        ) {
          await Mailbox.updateOne(
            { _id: existingMailbox._id },
            {
              $set: {
                totalMessages: mailbox.totalMessages,
                unseenMessages: mailbox.unseenMessages,
                updatedAt: new Date(),
              },
            }
          );
          console.log(`🔄 Updated mailbox: ${mailbox.name}`);
        }
      } else {
        await Mailbox.create({ ...mailbox, account: accountId });
        console.log(`✅ Saved new mailbox: ${mailbox.name}`);
      }
    }
    return mailboxes;
  } catch (error) {
    console.error("❌ Error saving mailboxes:", error.message);
    throw error;
  }
};

const fetchAndSaveGmailMailboxes = async (accountDetails) => {
  try {
    const accessToken = await refreshOAuthToken(accountDetails);
    if (!accessToken)
      throw new Error("❌ Failed to refresh OAuth token for Gmail.");

    const mailboxes = await fetchGmailMailboxes(accessToken);

    return await saveMailboxes(accountDetails._id, mailboxes);
  } catch (error) {
    console.error("❌ Gmail Mailbox Fetch Error:", error.message);
    throw error;
  }
};

const fetchAndSaveOutlookMailboxes = async (accountDetails) => {
  try {
    const tokens = await outlookService.refreshMicrosoftOAuthToken(accountDetails);
    if (!tokens.access_token) {
      throw new Error(" Failed to refresh OAuth token for Outlook.");
    }

    const response = await outlookService.getOutlookMailboxes(tokens.access_token);
    const folders = response.labels || [];
    
    if (folders.length === 0) {
      console.warn(" No mailboxes found for Outlook account. Will try default folders.");
      
      const defaultFolders = [
        {
          name: "Inbox",
          path: "inbox",
          totalMessages: 0,
          unseenMessages: 0,
          updatedAt: new Date(),
        },
        {
          name: "Sent Items",
          path: "sentitems", 
          totalMessages: 0,
          unseenMessages: 0,
          updatedAt: new Date(),
        },
        {
          name: "Drafts",
          path: "drafts",
          totalMessages: 0,
          unseenMessages: 0,
          updatedAt: new Date(),
        },
        {
          name: "Deleted Items",
          path: "deleteditems",
          totalMessages: 0,
          unseenMessages: 0,
          updatedAt: new Date(),
        },
      ];
      
      return await saveMailboxes(accountDetails._id, defaultFolders);
    }
    
    const mailboxes = folders.map(folder => {
      let path = folder.path;
      
      if (folder.name === "Inbox" || folder.name.toLowerCase() === "inbox") {
        path = "inbox";
      } else if (folder.name === "Sent Items" || folder.name === "Sent" || folder.name.toLowerCase() === "sentitems") {
        path = "sentitems";
      } else if (folder.name === "Drafts" || folder.name.toLowerCase() === "drafts") {
        path = "drafts";
      } else if (folder.name === "Deleted Items" || folder.name === "Trash" || folder.name.toLowerCase() === "deleteditems") {
        path = "deleteditems";
      }
      
      return {
        ...folder,
        path: path
      };
    });
    
    console.log(`Retrieved ${mailboxes.length} Outlook mailboxes`);
    
    return await saveMailboxes(accountDetails._id, mailboxes);
  } catch (error) {
    console.error("Outlook Mailbox Fetch Error:", error.message);
    throw error;
  }
};

const fetchAndSaveIMAPMailboxes = async (accountDetails) => {
  let client;
  try {
    const authConfig = {
      user: accountDetails.imap.auth.user,
      pass: accountDetails.imap.auth.pass,
    };

    client = new ImapFlow({
      host: accountDetails.imap.host,
      port: accountDetails.imap.port || 993,
      secure: true,
      auth: authConfig,
    });

    await client.connect();
    console.log("✅ IMAP Connected successfully");

    const mailboxes = await client.list();
    const mailboxDocuments = [];

    for (const mailbox of mailboxes) {
      console.log(`📂 Checking mailbox: ${mailbox.name}`);

      try {
        await client.mailboxOpen(mailbox.path);
        const status = await client.status(mailbox.path, [
          "messages",
          "unseen",
        ]);

        mailboxDocuments.push({
          account: accountDetails._id,
          name: mailbox.name,
          path: mailbox.path,
          totalMessages: status.messages || 0,
          unseenMessages: status.unseen || 0,
          updatedAt: new Date(),
        });
      } catch (err) {
        console.error(
          `❌ Error fetching status for ${mailbox.name}: ${err.message}`
        );
      }
    }

    return await saveMailboxes(accountDetails._id, mailboxDocuments);
  } catch (err) {
    console.error(`❌ IMAP Connection Error: ${err.message}`);
    throw err;
  } finally {
    if (client) {
      await client.logout();
      console.log("📭 IMAP Connection closed.");
    }
  }
};

const fetchGmailMailboxes = async (accessToken) => {
  try {
    const response = await fetch(
      "https://www.googleapis.com/gmail/v1/users/me/labels",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`❌ Gmail API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const labels = data.labels || [];

    const mailboxData = await Promise.all(
      labels.map(async (label) => {
        const labelResponse = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/labels/${label.id}`,
          { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const labelData = await labelResponse.json();
        return {
          name: label.name,
          path: label.id,
          totalMessages: labelData.messagesTotal || 0,
          unseenMessages: labelData.messagesUnread || 0,
          updatedAt: new Date(),
        };
      })
    );

    return mailboxData;
  } catch (error) {
    console.error("❌ Error fetching Gmail mailboxes:", error.message);
    throw error;
  }
};

const fetchAndSaveOutlookMessages = async (account, mailbox, limit = 50) => {
  try {
    console.log(`Fetching messages from Outlook mailbox: ${mailbox.name}`);
    
    const tokens = await outlookService.refreshMicrosoftOAuthToken(account);
    if (!tokens.access_token) {
      throw new Error("Failed to refresh OAuth token for Outlook.");
    }
    
    const response = await outlookService.getOutlookMessages(
      tokens.access_token,
      mailbox.path,
      limit,
      0
    );
    
    const messages = response.messages || [];
    console.log(`Retrieved ${messages.length} messages from ${mailbox.name}`);
    
    for (const msg of messages) {
      try {
        const existingMessage = await Message.findOne({ 
          account: account._id,
          mailbox: mailbox._id,
          uid: msg.id
        });
        
        if (existingMessage) {
          if (existingMessage.isRead !== msg.isRead) {
            existingMessage.isRead = msg.isRead;
            await existingMessage.save();
            console.log(`Updated read status for message: ${msg.id}`);
          }
          continue;
        }
        
        const newMessage = new Message({
          account: account._id,
          mailbox: mailbox._id,
          uid: msg.id,
          subject: msg.subject || "",
          from: msg.from ? [{ address: msg.from.emailAddress.address, name: msg.from.emailAddress.name }] : [],
          to: msg.toRecipients ? msg.toRecipients.map(r => ({ address: r.emailAddress.address, name: r.emailAddress.name })) : [],
          date: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
          body: msg.bodyPreview || "",
          isRead: msg.isRead || false,
          hasAttachments: msg.hasAttachments || false,
        });
        
        await newMessage.save();
        console.log(`Saved new message: ${newMessage.uid}`);
      } catch (err) {
        console.error(`❌ Error saving message ${msg.id}: ${err.message}`);
      }
    }
    
    return messages.length;
  } catch (error) {
    console.error(`❌ Error fetching Outlook messages: ${error.message}`);
    throw error;
  }
};

module.exports = { 
  fetchAndSaveMailboxes, 
  fetchAndSaveMessages,
  fetchAndSaveOutlookMessages 
};
