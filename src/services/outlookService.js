const querystring = require("querystring");
const axios = require("axios");

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/oauth/callback";

/**
 * Generate Microsoft OAuth2 Authentication URL
 */
const getAuthUrl = () => {
  const params = querystring.stringify({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: "openid profile email User.Read offline_access",
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

    return tokenResponse.data;
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

module.exports = {
  getAuthUrl,
  getAccessToken,
  getUserDetails,
};
