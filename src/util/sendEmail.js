const { default: axios } = require("axios");

const sendEmailFromGoogle = async (accessToken, fromEmail, toEmail) => {
  if (!toEmail) {
    throw new Error(" Recipient email address is missing!");
    return;
  }

  const emailContent = `From: ${fromEmail}
To: ${toEmail}
Subject: Google OAuth Email Test
Content-Type: text/plain; charset="UTF-8"

This is a test email sent from the logged-in Google account using OAuth authentication.`;

  // Convert to Base64 (correct format)
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
  } catch (error) {
    throw new Error("Something went wrong");
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

module.exports = { sendEmailFromGoogle,sendEmailWithSMTP };
