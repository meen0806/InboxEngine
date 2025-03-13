const { generateAuthUrl, getTokens } = require('../services/oauthService');


/**
 * Get Google OAuth2 Authentication URL
 */
exports.getAuthUrl = (req, res) => {
  try {
    const { origin } = req.query;
    const authUrl = generateAuthUrl(origin);
    res.status(200).json({ success: true,url: authUrl });
  } catch (error) {
    res.status(500).json({success: false, error: 'Failed to generate authentication URL', details: error.message });
  }
};

/**
 * Handle OAuth2 Callback
 */
exports.handleCallback = async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    const tokens = await getTokens(code);
    const redirectUrl = decodeURIComponent(state || "/email-account");
    res.redirect(`${redirectUrl}?auth_success=true`);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process callback', details: error.message });
  }
};
