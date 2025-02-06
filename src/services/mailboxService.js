const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const Message = require("../models/message");
const Mailbox = require("../models/mailbox");
const Attachment = require("../models/attachment");
const message = require("../models/message");

const STATIC_SEARCH_CRITERIA = [
  "SINCE",
  new Date("2025-01-01T00:00:00Z").toISOString(),
];

const fetchAndSaveMessages = async (account, criteria) => {
  if (account.type === "gmail" || account.type === "outlook") {
    const accessToken = await refreshOAuthToken(account);
    account.imap.auth.accessToken = accessToken;
  }

  const { imap, type, oauth2 } = account;

  const imapConfig =
    type === "gmail" || type === "outlook"
      ? {
          host: type === "gmail" ? "imap.gmail.com" : "outlook.office365.com",
          port: 993,
          secure: true,
          auth: {
            user: imap.auth.user,
            accessToken: oauth2.tokens?.access_token,
          },
        }
      : {
          host: imap.host,
          port: imap.port,
          secure: imap.secure,
          auth: {
            user: imap.auth.user,
            pass: imap.auth.pass,
          },
        };

  const client = new ImapFlow(imapConfig);
  try {
    await client.connect();

    // Get all mailboxes associated with the account
    const mailboxes = await Mailbox.find({ account: account._id });

    for (const mailbox of mailboxes) {
      let lock;
      try {
        lock = await client.getMailboxLock(mailbox.path);

        lastDate = criteria.lastFetchedMessage;

        const newMessages = await Message.find({
          createdAt: { $gt: lastDate },
        }).sort({ createdAt: -1 });
        console.log("newMessages", newMessages);
        const searchCriteria = lastDate
          ? ["SINCE", lastDate.toUTCString()]
          : "ALL";

        // Fetch messages for this mailbox
        for await (const message of client.fetch(searchCriteria, {
          envelope: true,
          source: true,
        })) {
          // console.log(`${message.uid}: ${message.envelope.subject}`);
          const parsedMessage = await simpleParser(message.source);

          // Check if message exists in the database
          const existingMessage = await Message.findOne({
            account: account._id,
            uid: message.uid,
          });

          console.log("existing message", existingMessage);
          if (existingMessage) continue;

          // Transform headers to strings
          const transformedHeaders = {};
          for (const [key, value] of parsedMessage.headers) {
            transformedHeaders[key] =
              typeof value === "object" ? JSON.stringify(value) : value;
          }

          const from =
            parsedMessage.from?.value.map((v) => ({
              name: v.name || "",
              address: v.address,
            })) || [];

          const to =
            parsedMessage.to?.value.map((v) => ({
              name: v.name || "",
              address: v.address,
            })) || [];

          // Save the message
          const newMessage = new Message({
            account: account._id,
            mailbox: mailbox._id,
            uid: message.uid,
            subject: parsedMessage.subject || "",
            from,
            to,
            date: parsedMessage.date || new Date(),
            body: parsedMessage.text || parsedMessage.html || "",
            flags: message.flags || [],
            headers: transformedHeaders,
          });

          // Save attachments
          if (
            parsedMessage.attachments &&
            parsedMessage.attachments.length > 0
          ) {
            const attachments = await Promise.all(
              parsedMessage.attachments.map(async (attachment) => {
                const newAttachment = new Attachment({
                  message: newMessage._id,
                  filename: attachment.filename,
                  contentType: attachment.contentType,
                  content: attachment.content,
                  size: attachment.size,
                });
                await newAttachment.save();
                return newAttachment._id;
              })
            );
            newMessage.attachments = attachments;
          }

          const mes = await newMessage.save();

          console.log("mes", mes);
        }
      } catch (err) {
        console.error(
          `Error processing mailbox ${mailbox.path}: ${err.message}`
        );
      } finally {
        if (lock) lock.release();
      }
    }

    await client.logout();
    console.log(`Finished fetching messages for account ${account.account}`);
  } catch (err) {
    console.error(
      `Error fetching messages for account ${account.account}: ${err.message}`
    );
  }
};

const fetchAndSaveMailboxes = async (accountDetails) => {
  const client = new ImapFlow({
    host: accountDetails.imap.host,
    port: accountDetails.imap.port,
    secure: accountDetails.imap.secure,
    auth: {
      user: accountDetails.imap.auth.user,
      pass: accountDetails.imap.auth.pass,
    },
  });

  try {
    await client.connect();
    const mailboxes = await client.list();
    await client.logout();

    // Transform and save mailboxes
    const mailboxDocuments = mailboxes.map((mailbox) => ({
      account: accountDetails._id,
      name: mailbox.name,
      path: mailbox.path,
    }));

    // Save to the database
    await Mailbox.insertMany(mailboxDocuments);

    return mailboxDocuments; // Return the saved mailboxes
  } catch (error) {
    console.error("Error fetching and saving mailboxes:", error.message);
    throw error;
  }
};

module.exports = { fetchAndSaveMailboxes, fetchAndSaveMessages };
