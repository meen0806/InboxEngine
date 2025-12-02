const { default: axios } = require("axios");
const nodemailer = require("nodemailer");
const { refreshOAuthToken } = require("../services/oauthService");
const { refreshMicrosoftOAuthToken } = require("../services/outlookService");
const { google } = require("googleapis");

const sendEmailFromGoogle = async (accessToken, fromEmail, toEmail, expiryTime, account,emailbody) => {
  if (!toEmail) {
    throw new Error("Recipient email address is missing!");
  }

  const isTokenExpired = (expiryDate) => {
    return Date.now() >= expiryDate;
  };

  if (isTokenExpired(account.oauth2.tokens.expiry_date)) {
    console.log("🔄 Access token expired, refreshing...");
    accessToken = await refreshOAuthToken(account);
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const emailContent =
    `From: <${fromEmail}>\r\n` +
    `To: <${toEmail}>\r\n` +
    `Subject: ${emailbody.subject}\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
    `${emailbody.emailBody}`;

  const encodedMessage = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const response = await axios.post(
      "https://www.googleapis.com/gmail/v1/users/me/messages/send",
      { raw: encodedMessage },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Email sent successfully:", response.status);
    return response.data;
  } catch (error) {
    console.error("❌ Error sending email via Google:", error.response?.data || error.message);
    throw new Error("Failed to send email via Google.");
  }
};

const sendReplyFromGoogle = async (
  accessToken,
  toEmail,
  expiryTime,
  account,
  emailbody,
  originalMessageId,
  threadId,
  toName = "",
  uid
) => {
  if (!toEmail) throw new Error("Recipient email address is missing!");

  const isTokenExpired = (expiryDate) => Date.now() >= expiryDate;

  if (isTokenExpired(account.oauth2.tokens.expiry_date)) {
    console.log("🔄 Access token expired, refreshing...");
    accessToken = await refreshOAuthToken(account);
  }

  const fromName = account.name;
  const fromEmail = account.email;
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  
  const originalMsg = await gmail.users.messages.get({
    userId: "me",
    id: uid,
    format: "full"
  });


  const headers = originalMsg.data.payload.headers;
  const fromHeader = headers.find(h => h.name.toLowerCase() === "from")?.value || "";
  const dateHeader = headers.find(h => h.name.toLowerCase() === "date")?.value || "";
  console.log(fromHeader,"headerfrom")
  
  const match = fromHeader.match(/(.*)<(.*)>/);
  const originalFromName = match ? match[1].trim() : fromHeader;
 
  let originalFromEmail = match ? match[2].trim() : fromHeader;
  
  
  function extractPlainTextBody(payload) {
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8");
        } else if (part.parts) {
          const nested = extractPlainTextBody(part);
          if (nested) return nested;
        }
      }
    }
    return payload.body?.data
      ? Buffer.from(payload.body.data, "base64").toString("utf-8")
      : "";
  }

  const originalMessageBody = extractPlainTextBody(originalMsg.data.payload);

  
  const quotedOriginal =
    `\r\n\r\nOn ${dateHeader}, ${originalFromName} &lt;<a href="mailto:${originalFromEmail}">${originalFromEmail}</a>&gt; wrote:\r\n`;

  
  const formattedFrom = fromName ? `${fromName} <${fromEmail}>` : `<${fromEmail}>`;
  const formattedTo = toName ? `${toName} <${toEmail}>` : `<${toEmail}>`;

 
 const emailContent =
  `From: ${formattedFrom}\r\n` +
  `To: ${formattedTo}\r\n` +
  `Subject: Re: ${emailbody.subject}\r\n` +
  `In-Reply-To: ${headers["message-id"]}\r\n` +
  `References: ${headers["message-id"]}\r\n` +
  `Content-Type: text/html; charset="UTF-8"\r\n\r\n` +
  `<div>${emailbody.emailBody}</div>` +
  `<br><br>` +
  `<div>${quotedOriginal}</div>`+
   `<div style="border-left:1px solid #ccc; margin-left:10px; padding-left:10px;">${originalMessageBody.replace(/\n/g, ' ')}</div>`;


  const encodedMessage = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // ✅ 5. Send Reply
  try {
    const response = await axios.post(
      "https://www.googleapis.com/gmail/v1/users/me/messages/send",
      {
        raw: encodedMessage,
        threadId: threadId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Reply sent successfully:", response.status);
    return response.data;
  } catch (error) {
    console.error("❌ Error sending reply via Google:", error.response?.data || error.message);
    throw new Error("Failed to send reply via Google.");
  }
};


const sendEmailWithSMTP = async (account, toEmail,emailbody) => {

  if (!toEmail) {
    throw new Error("Recipient email address is missing!");
  }

  const transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.smtp.auth.user,
      pass: account.smtp.auth.pass,
    },
  });

  const mailOptions = {
    from: account.smtp.auth.user,
    to: toEmail,
    subject: emailbody.subject,
    text: emailbody.emailBody
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    throw new Error("Something went wrong while sending email via SMTP");
  }
};

const sendEmailFromMicrosoft = async (accessToken, fromEmail, toEmail, expiryTime, emailbody, account) => {
  if (!accessToken) {
    throw new Error("Access token is required!");
  }
  if (!toEmail) {
    throw new Error("Recipient email is required!");
  }
  const isTokenExpired = (tokenExpiryTime) => {
    const currentTime = Date.now();

    return currentTime >= tokenExpiryTime;
  };

  if (isTokenExpired(expiryTime)) {
    accessToken = await refreshOAuthToken(account);
  }

  if (isTokenExpired(expiryTime)) {
    if (!account.oauth2.tokens.refresh_token) {
      throw new Error(
        "Missing refresh token. Please log in again to generate a new one."
      );
    }

    accessToken = await refreshMicrosoftOAuthToken(account);
  }

  const emailData = {
    message: {
      subject: emailbody.subject,
      body: {
        contentType: "Text",
        content:
        emailbody.emailBody
      },
      toRecipients: [
        {
          emailAddress: { address: toEmail },
        },
      ],
      from: {
        emailAddress: { address: fromEmail },
      },
    },
    saveToSentItems: true,
  };

  try {
    const response = await axios.post(
      "https://graph.microsoft.com/v1.0/me/sendMail",
      emailData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Email sent successfully:", response.status);
    return response.data;
  } catch (error) {
    console.error(
      "Error sending email:",
      error.response?.data || error.message
    );
    throw new Error("Failed to send test email");
  }
};

module.exports = { sendEmailFromGoogle, sendEmailWithSMTP, sendEmailFromMicrosoft,sendReplyFromGoogle };
