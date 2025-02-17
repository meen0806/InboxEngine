const { default: axios } = require("axios");

const sendEmailFromGoogle = async (accessToken, fromEmail, toEmail) => {
  if (!toEmail) {
    console.error("Error: Recipient email address is missing!");
    return;
  }

  console.log("✅ Sending email from:", fromEmail);
  console.log("📩 Sending email to:", toEmail);

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
    .replace(/=+$/, ""); // Remove padding

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

    console.log("✅ Email sent successfully!", response.data);
  } catch (error) {
    console.error(
      "❌ Failed to send email:",
      error.response?.data || error.message
    );
  }
};

module.exports = { sendEmailFromGoogle };
