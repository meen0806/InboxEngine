const nodemailer = require('nodemailer');

const getOAuthTokens = async (type, accountDetails) => {
  if (type === 'gmail') {
    return {
      accessToken: 'gmail-access-token',
      refreshToken: 'gmail-refresh-token',
      clientId: accountDetails.oauth2.clientId,
      clientSecret: accountDetails.oauth2.clientSecret,
      expires: 3600,
    };
  }

  if (type === 'outlook') {
    return {
      accessToken: 'outlook-access-token',
      refreshToken: 'outlook-refresh-token',
      clientId: accountDetails.oauth2.clientId,
      clientSecret: accountDetails.oauth2.clientSecret,
      expires: 3600,
    };
  }


  throw new Error('Unsupported account type for OAuth');
};

const verifyAccountGmail = async ({ imap, smtp, accessToken }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: smtp.auth.user,
        accessToken,
      },
    });

    await transporter.verify();
    return { success: true, message: 'Gmail account verified successfully' };
  } catch (error) {
    return { success: false, message: `Gmail verification failed: ${error.message}` };
  }
};

const verifyAccountOutlook = async ({ imap, smtp, accessToken }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'outlook',
      auth: {
        type: 'OAuth2',
        user: smtp.auth.user,
        accessToken,
      },
    });

    await transporter.verify();
    return { success: true, message: 'Outlook account verified successfully' };
  } catch (error) {
    return { success: false, message: `Outlook verification failed: ${error.message}` };
  }
};

const verifyAccountCredentials = async ({ imap, smtp, proxy, smtpEhloName }) => {
  if (!imap || !smtp) {
    throw new Error("IMAP and SMTP configurations are required for verification");
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: {
        user: smtp.auth.user,
        pass: smtp.auth.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    await transporter.verify();
    console.log("✅ SMTP Connection Verified");

    const mailOptions = {
      from: smtp.auth.user,
      to: "priyalgeitpl@gmail.com",
      subject: "SMTP Test Email",
      text: "This is a test email sent using SMTP with Nodemailer.",
    };

    const emailResponse = await transporter.sendMail(mailOptions);
    console.log("✅ Test Email Sent:", emailResponse.messageId);

    return {
      success: true,
      message: "SMTP verified and test email sent successfully",
    };
  } catch (err) {
    console.error("❌ SMTP Verification Failed:", err);
    return {
      success: false,
      message: `SMTP verification failed: ${err.message}`,
    };
  }
};

module.exports = { getOAuthTokens, verifyAccountGmail, verifyAccountOutlook, verifyAccountCredentials };