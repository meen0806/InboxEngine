
const { getAuthUrl, getAccessToken, getUserDetails } = require("../services/outlookService");


/**
 * Get Microsoft OAuth2 Authentication URL
 */

const getMicrosoftAuthUrl = (req, res) => {
  try {
    const authUrl = getAuthUrl();
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
    const code = req.query.code;


  if (!code) return res.status(400).json({ success: false, error: "No authorization code received" });
    
   const tokens=await getAccessToken(code)

    const user=await getUserDetails(tokens.access_token)

    // Return response
    res.json({
      success: true,
      message: 'Login Successful!',
      tokens,
      user
    });
  } catch (error) {
    console.error('Error during authentication:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Authentication failed" });
  }
};

module.exports = {
  getMicrosoftAuthUrl,
  handleMicrosoftCallback,
};
