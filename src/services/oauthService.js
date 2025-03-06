const { google } = require("googleapis");
const axios = require("axios");
const querystring = require("querystring");
const Account = require("../models/account");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Generate Google OAuth2 Authentication URL
 */
const generateAuthUrl = (origin=null) => {
  const scopes = [
    "openid",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    
  ];

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
      state: origin,
    })
  );
};

/**
 * Handle Callback and Exchange Code for Tokens
 * @param {string} code - Authorization code from Google
 */
const getTokens = async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const { access_token, refresh_token ,scope,token_type,expiry_date} = tokens;
    const userInfo=await getUserInfo(access_token)

   
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
         tokens: { access_token, refresh_token, scope,token_type ,expiry_date},
        },
        createdAt: new Date(),
      });

    
    } else {
  
      account.oauth2 = {
        authorize: true,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
        tokens: { access_token, refresh_token, scope,token_type ,expiry_date},
      };
     
    }

    await account.save();

    return tokens;
  } catch (error) {
    throw new Error(`Failed to exchange code for tokens: ${error.message}`);
  }
};


const getUserInfo=async(accessToken) =>{
  try {
      const oauth2 = google.oauth2({
          auth: oauth2Client,
          version: "v2",
      });
      const { data } = await oauth2.userinfo.get({
          auth: oauth2Client,
      });
      return data; 
  } catch (error) {
      console.error("Error fetching user info:", error);
      throw new Error("Failed to fetch user info");
  }
}


const refreshOAuthToken = async (account) => {
  console.log("Account",account)
  try {
    const { oauth2 } = account;

    // if (
    //   !oauth2 ||
    //   !oauth2.clientId ||
    //   !oauth2.clientSecret ||
    //   !oauth2.tokens.refresh_token
    // ) {
    //   throw new Error("OAuth2 configuration is missing or invalid");
    // }

    const tokenUrl =
      account.type === "gmail"
        ? "https://oauth2.googleapis.com/token"
        : "https://login.microsoftonline.com/common/oauth2/v2.0/token";

    const response = await axios.post(tokenUrl, null, {
      params: {
        client_id: oauth2.clientId,
        client_secret: oauth2.clientSecret,
        refresh_token: oauth2.tokens.refresh_token,
        grant_type: "refresh_token",
      },
    });

    const tokens = response.data;
    account.oauth2.tokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || oauth2.tokens.refresh_token, // Keep old one if missing
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: Date.now() + tokens.expires_in * 1000, // Calculate new expiry time
    };
    // account.oauth2.tokens = tokens; // Save new tokens
    await account.save(); // Persist updated tokens to the database

    return tokens.access_token;
  } catch (err) {
    throw new Error(`Failed to refresh OAuth token: ${err.message}`);
  }
};

module.exports = { generateAuthUrl, getTokens, refreshOAuthToken };
