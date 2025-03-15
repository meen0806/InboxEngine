const { generateAuthUrl, getTokens } = require('../services/oauthService');
const { getAccessToken } = require('../services/outlookService');

exports.getAuthUrl = (req, res) => {
  try {
    const { origin, orgId } = req.query;
    const authUrl = generateAuthUrl(origin, orgId);
    res.status(200).json({ success: true,url: authUrl });
  } catch (error) {
    res.status(500).json({success: false, error: 'Failed to generate authentication URL', details: error.message });
  }
};

exports.handleCallback = async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ error: "Authorization code is required" });
  }

  let orgId = null;
  let redirectUrl = "/email-account";

  if (state) {
    try {
      const parsedState = JSON.parse(decodeURIComponent(state));
      redirectUrl = parsedState.origin || redirectUrl;
      orgId = parsedState.orgId || null;
    } catch (error) {
      console.error("Error parsing state:", error);
    }
  }

  if (!orgId) {
    return res.status(400).json({ error: "Organization ID is required" });
  }

  try {
    // Pass orgId to getTokens
    const tokens = await getTokens(code, orgId);

    res.redirect(`${redirectUrl}?auth_success=true&orgId=${orgId}`);
  } catch (error) {
    res.status(500).json({ error: "Failed to process callback", details: error.message });
  }
};

