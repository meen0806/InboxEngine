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
    res.status(200).json({
      message: 'Authorization successful',
      tokens,
    });
 
  } catch (error) {
    res.status(500).json({ error: 'Failed to process callback', details: error.message });
  }
};
