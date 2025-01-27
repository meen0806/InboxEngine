const express = require('express');
const router = express.Router();
const oauthController = require('../controllers/oauthController');

// Endpoint to get the Google OAuth2 authentication URL
router.get('/auth-url', oauthController.getAuthUrl);

// Endpoint to handle the callback from Google OAuth2
router.get('/callback', oauthController.handleCallback);

module.exports = router;
