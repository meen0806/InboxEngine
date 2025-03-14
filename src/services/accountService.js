const nodemailer = require('nodemailer');

/**
 * Get OAuth Tokens for Gmail or Outlook
 */
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

/**
 * Verify Gmail Account Credentials
 */
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

/**
 * Verify Outlook Account Credentials
 */
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

/**
 * Verify General Account Credentials
 */
const verifyAccountCredentials = async ({ imap, smtp, proxy, smtpEhloName }) => {
  if (!imap || !smtp) {
    throw new Error('IMAP and SMTP configurations are required for verification');
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure, // Use TLS/SSL
      auth: {
        user: smtp.auth.user,
        pass: smtp.auth.pass,
      },
      // proxy, // Optional proxy for SMTP connection
      // name: smtpEhloName || undefined, // Optional EHLO/HELO hostname
    });

    const mailOptions = {
      from: smtp.auth.user,
      to: 'priyalgeitpl@gmail.com',
      subject: "SMTP Test Email",
      text: "This is a test email sent using SMTP with Nodemailer.",
    };
  
    const email = await transporter.sendMail(mailOptions)
    console.log(email)

    // Verify connection configuration
    const res = await transporter.verify();
    console.log(res);
    return { success: true, message: 'SMTP verified successfully' };
  } catch (err) {
    return { success: false, message: `SMTP verification failed: ${err.message}` };
  }
};

module.exports = {
  getOAuthTokens,
  verifyAccountGmail,
  verifyAccountOutlook,
  verifyAccountCredentials,
};