const { google } = require("googleapis");
const axios = require("axios");
const querystring = require("querystring");
const mongoose = require('mongoose');
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const generateAuthUrl = (origin = null, orgId) => {
  const scopes = [
    "openid",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
  ];

  const state = JSON.stringify({ origin, orgId });

  return (
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    querystring.stringify({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: encodeURIComponent(state),
    })
  );
};

const getTokens = async (code, orgId) => {
  const Account = mongoose.model("Account");

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const { access_token, refresh_token, scope, token_type, expiry_date } =
      tokens;
    const userInfo = await getUserInfo(access_token);

    let account = await Account.findOne({ email: userInfo.email });

    if (!account) {
      account = new Account({
        email: userInfo.email,
        name: userInfo.name,
        account: userInfo.email,
        type: "gmail",
        // state: "connected",
        oauth2: {
          authorize: true,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          redirectUri: process.env.GOOGLE_REDIRECT_URI,
          tokens: {
            access_token,
            refresh_token,
            scope,
            token_type,
            expiry_date,
          },
        },
        createdAt: new Date(),
      });
    } else {
      account.oauth2 = {
        authorize: true,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
        tokens: { access_token, refresh_token, scope, token_type, expiry_date },
      };
    }

    account.orgId = orgId;
    await account.save();

    return tokens;
  } catch (error) {
    throw new Error(`Failed to exchange code for tokens: ${error.message}`);
  }
};

const getUserInfo = async (accessToken) => {
  try {
    if (!accessToken) {
      throw new Error("Access token is missing");
    }

    const response = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    console.log("✅ User info fetched:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Failed to fetch user info:", error.response?.data || error.message);
    throw new Error("Failed to fetch user info");
  }
};

const refreshOAuthToken = async (account) => {
  try {
    const { oauth2 } = account;

    if (!oauth2 || !oauth2.clientId || !oauth2.clientSecret || !oauth2.tokens.refresh_token) {
      throw new Error("OAuth2 configuration is missing or invalid");
    }

    const tokenUrl = "https://oauth2.googleapis.com/token";
    const response = await axios.post(tokenUrl, null, {
      params: {
        client_id: oauth2.clientId,
        client_secret: oauth2.clientSecret,
        refresh_token: oauth2.tokens.refresh_token,
        grant_type: "refresh_token",
      },
    });

    const tokens = response.data;

    if (!tokens.access_token) {
      throw new Error("OAuth token refresh failed: No access token received.");
    }

    account.oauth2.tokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || oauth2.tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: Date.now() + tokens.expires_in * 1000,
    };

    await account.save();
    console.log("✅ Token refreshed successfully:", account.oauth2.tokens);
    
    return tokens.access_token;
  } catch (err) {
    console.error("❌ Failed to refresh OAuth token:", err.response?.data || err.message);
    throw new Error(`Failed to refresh OAuth token: ${err.message}`);
  }
};

module.exports = { generateAuthUrl, getTokens, refreshOAuthToken };
