const querystring = require("querystring");
const axios = require("axios");
const Account = require("../models/account");
const dotenv = require("dotenv");
dotenv.config();
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI;

/**
 * Generate Microsoft OAuth2 Authentication URL
 */
const getAuthUrl = (origin) => {
  const params = querystring.stringify({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: "openid profile email User.Read offline_access",
    state: origin,
    prompt:"select_account"
  });

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
};

/**
 * Exchange authorization code for access token
 */
const getAccessToken = async (code) => {
  try {
    const tokenResponse = await axios.post(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      querystring.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, scope, token_type, expires_in } =
      tokenResponse.data;

    const userInfo = await getUserDetails(access_token);

    const email = userInfo.userPrincipalName || userInfo.mail;
    const username = email.split("@")[0];

    let account = await Account.findOne({ email: userInfo.mail });

    if (!account) {
      account = new Account({
        email: userInfo.mail,
        name: username,
        account: userInfo.mail,
        type: "outlook",
        oauth2: {
          authorize: true,
          clientId: process.env.CLIENT_ID,
          clientSecret: process.env.CLIENT_SECRET,
          redirectUri: process.env.REDIRECT_URI,
          tokens: {
            access_token,
            refresh_token,
            scope,
            token_type,
            expires_in,
          },
        },
        createdAt: new Date(),
      });
    } else {
      account.oauth2 = {
        authorize: true,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        redirectUri: process.env.REDIRECT_URI,
        tokens: { access_token, refresh_token, scope, token_type, expires_in },
      };
    }

    await account.save();
    return { access_token, refresh_token, scope, token_type, expires_in };
  } catch (error) {
    console.error("Error fetching access token:", error.response?.data || error.message);
    throw new Error("Failed to fetch access token");
  }
};

/**
 * Fetch user details from Microsoft Graph API
 */
const getUserDetails = async (accessToken) => {
  try {
    const userResponse = await axios.get("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    return userResponse.data;
  } catch (error) {
    console.error("Error fetching user details:", error.response?.data || error.message);
    throw new Error("Failed to fetch user details");
  }
};

const refreshMicrosoftOAuthToken = async (account) => {
  try {
    if (!account?.oauth2?.tokens?.refresh_token) {
      throw new Error("Missing refresh token. Please log in again.");
    }

    const tokenResponse = await axios.post(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      querystring.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: account.oauth2.tokens.refresh_token,
        grant_type: "refresh_token",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in, token_type, scope } =
      tokenResponse.data;

   
    account.oauth2.tokens = {
      access_token,
      refresh_token, 
      expires_in,
      token_type,
      scope,
    };

    await account.save();

    return { access_token, refresh_token, expires_in, token_type, scope };
  } catch (error) {
    console.error("Error refreshing access token:", error.response?.data || error.message);
    throw new Error("Failed to refresh access token");
  }
};


module.exports = {
  getAuthUrl,
  getAccessToken,
  getUserDetails,
  refreshMicrosoftOAuthToken
};
