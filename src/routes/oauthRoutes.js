const express = require('express');
const router = express.Router();
const oauthController = require('../controllers/oauthController');

router.get('/auth-url', oauthController.getAuthUrl);
router.get('/callback', oauthController.handleCallback);

module.exports = router;
