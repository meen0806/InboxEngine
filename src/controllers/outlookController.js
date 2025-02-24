
const { getAuthUrl, getAccessToken, getUserDetails } = require("../services/outlookService");


/**
 * Get Microsoft OAuth2 Authentication URL
 */

const getMicrosoftAuthUrl = (req, res) => {
  try {
   
    const {origin}=req.query
    const authUrl = getAuthUrl(origin);
    res.status(200).json({ success: true,url: authUrl });
  } catch (error) {
    res.status(500).json({success: false, error: 'Failed to generate authentication URL', details: error.message });
  }
};

/**
 * Handle Microsoft OAuth2 Callback
 */
const handleMicrosoftCallback = async (req, res) => {
  

  try {
    const { code, state } = req.query;


    if (!code) return res.status(400).json({ success: false, error: "No authorization code received" });

    const tokens = await getAccessToken(code)

    const redirectUrl = decodeURIComponent(state || "/email-account");
    res.redirect(`${redirectUrl}?auth_success=true`);

    res.status(200)

    // Return response
  } catch (error) {
    console.error('Error during authentication:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Authentication failed" });
  }
};

module.exports = {
  getMicrosoftAuthUrl,
  handleMicrosoftCallback,
};
