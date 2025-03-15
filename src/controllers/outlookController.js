
const { getAuthUrl, getAccessToken } = require("../services/outlookService");

const getMicrosoftAuthUrl = (req, res) => {
  try {

    const { origin, orgId } = req.query
    const authUrl = getAuthUrl(origin, orgId);
    res.status(200).json({ success: true, url: authUrl });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate authentication URL', details: error.message });
  }
};

const handleMicrosoftCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ success: false, error: "No authorization code received" });
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
      return res.status(400).json({ success: false, error: "Organization ID is required" });
    }

    try {
      const tokens = await getAccessToken(code, orgId);

      res.redirect(`${redirectUrl}?auth_success=true&orgId=${encodeURIComponent(orgId)}`);
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to process callback", details: error.message });
    }
  } catch (error) {
    console.error("Unexpected error in handleMicrosoftCallback:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

module.exports = { getMicrosoftAuthUrl, handleMicrosoftCallback };
