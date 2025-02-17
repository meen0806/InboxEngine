const { generateAuthUrl, getTokens } = require('../services/oauthService');
const Account =require("../models/account");
const { sendEmailFromGoogle } = require('../util/sendEmail');
const { default: axios } = require('axios');

/**
 * Get Google OAuth2 Authentication URL
 */
exports.getAuthUrl = (req, res) => {
  try {
    const authUrl = generateAuthUrl();
    res.status(200).json({ success: true,url: authUrl });
  } catch (error) {
    res.status(500).json({success: false, error: 'Failed to generate authentication URL', details: error.message });
  }
};

/**
 * Handle OAuth2 Callback
 */
exports.handleCallback = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    const tokens = await getTokens(code);
    const { access_token, refresh_token ,scope,token_type,expiry_date} = tokens;
    // console.log("Access token", access_token);
    console.log('Refresh Token', tokens);
    const googleResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    const userInfo = googleResponse.data;
    console.log("**********,info", userInfo);
    // Step 3: Find Existing Account
    let account = await Account.findOne({ email: userInfo.email });

    if (!account) {
      // Step 4: Create New Account
      account = new Account({
        email: userInfo.email,
        name: userInfo.name,
        account: userInfo.email, // Assuming email as account identifier
        type: "gmail",
        state: "connected",
        oauth2: {
          authorize: true,
          clientId: process.env.GOOGLE_CLIENT_ID, // Ensure this is set in your environment
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          redirectUri: process.env.GOOGLE_REDIRECT_URI,
         tokens: { access_token, refresh_token, scope,token_type ,expiry_date},
        },
        createdAt: new Date(),
      });

      console.log("Creating New Account:", account);
    } else {
      
      // Step 5: Update Existing Account
      account.oauth2 = {
        authorize: true,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
        tokens: { access_token, refresh_token, scope,token_type ,expiry_date},
      };
      account.state = "connected";
      console.log("Updating Existing Account:", account);
    }

    await account.save();
    console.log("OAuth Details Saved Successfully");

    // Step 6: Send Email Notification
    sendEmailFromGoogle(
      access_token,
      userInfo.email,
      "deepakkushwaha6889@gmail.com"
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to process callback', details: error.message });
  }
};
