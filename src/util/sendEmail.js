const { default: axios } = require("axios");
const nodemailer = require("nodemailer");
const { refreshOAuthToken } = require("../services/oauthService");
const { refreshMicrosoftOAuthToken } = require("../services/outlookService");

const sendEmailFromGoogle = async (accessToken, fromEmail, toEmail, expiryTime, account) => {
  if (!toEmail) {
    throw new Error("Recipient email address is missing!");
  }

  const isTokenExpired = (expiryDate) => {
    return Date.now() >= expiryDate;
  };

  // Check and refresh token if expired
  if (isTokenExpired(account.oauth2.tokens.expiry_date)) {
    console.log("🔄 Access token expired, refreshing...");
    accessToken = await refreshOAuthToken(account);
  }

  console.log("📨 Sending email with token:", accessToken);

  const emailContent = 
  `From: <${fromEmail}>\r\n` +
  `To: <${toEmail}>\r\n` +
  `Subject: Google OAuth Email Test\r\n` +
  `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
  `This is a test email sent from the logged-in Google account using OAuth authentication.`;

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

const sendEmailWithSMTP = async (account, toEmail) => {

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
    subject: "SMTP Test Email",
    text: "This is a test email sent using SMTP with Nodemailer.",
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    throw new Error("Something went wrong while sending email via SMTP");
  }
};

const sendEmailFromMicrosoft = async (accessToken, fromEmail, toEmail, expiryTime) => {
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
    // Check if refresh token exists before refreshing
    if (!account.oauth2.tokens.refresh_token) {
      throw new Error(
        "Missing refresh token. Please log in again to generate a new one."
      );
    }

    accessToken = await refreshMicrosoftOAuthToken(account);
  }

  const emailData = {
    message: {
      subject: "Test Email from Microsoft OAuth2",
      body: {
        contentType: "Text",
        content:
          "This is a test email sent via Microsoft Graph API using OAuth2.",
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

module.exports = { sendEmailFromGoogle, sendEmailWithSMTP, sendEmailFromMicrosoft };
