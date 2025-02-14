const { google } = require('googleapis');
const axios = require('axios');
const Account = require("../models/account");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Generate Google OAuth2 Authentication URL
 */
const generateAuthUrl = () => {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: "consent",
  });

  return authUrl;
};

/**
 * Handle Callback and Exchange Code for Tokens
 * @param {string} code - Authorization code from Google
 */
const getTokens = async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const { data: user } = await oauth2.userinfo.get();
    let account = await Account.findOne({ email: user.email });
    if (!account) {
      account = new Account({
        email: user.email,
        name: user.name,
        oauth2: {
          authorize: true,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          redirectUri: process.env.GOOGLE_REDIRECT_URI,
          tokens: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            expiresIn: tokens.expiry_date || Date.now() + 3600 * 1000,
            scope: tokens.scope,
            tokenType: tokens.token_type,
          },
        },
      });
    } else {
      account.oauth2 = {
        authorize: true,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
        tokens: {
          accessToken: tokens.access_token,
          refreshToken:
            tokens.refresh_token || account.oauth2.tokens.refreshToken,
          expiresIn: tokens.expiry_date || Date.now() + 3600 * 1000,
          scope: tokens.scope,
          tokenType: tokens.token_type,
        },
      };
    }
    await account.save({ validateBeforeSave: false });
    // Here, you can save tokens to the database if needed
    return tokens;
  } catch (error) {
    throw new Error(`Failed to exchange code for tokens: ${error.message}`);
  }
};




const refreshOAuthToken = async (account) => {
  try {
    const { oauth2 } = account;

    if (!oauth2 || !oauth2.clientId || !oauth2.clientSecret || !oauth2.refreshToken) {
      throw new Error('OAuth2 configuration is missing or invalid');
    }

    const tokenUrl = account.type === 'gmail'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

    const response = await axios.post(tokenUrl, null, {
      params: {
        client_id: oauth2.clientId,
        client_secret: oauth2.clientSecret,
        refresh_token: oauth2.refreshToken,
        grant_type: 'refresh_token',
      },
    });

    const tokens = response.data;
    account.oauth2.tokens = tokens; // Save new tokens
    await account.save(); // Persist updated tokens to the database

    return tokens.access_token;
  } catch (err) {
    throw new Error(`Failed to refresh OAuth token: ${err.message}`);
  }
};



module.exports = { generateAuthUrl, getTokens, refreshOAuthToken };
