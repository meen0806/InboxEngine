
const express = require("express");
const { getMicrosoftAuthUrl, handleMicrosoftCallback } = require("../controllers/outlookController");

const router = express.Router();

// Route for Microsoft OAuth2 Authentication URL
router.get("/auth/microsoft", getMicrosoftAuthUrl);

// Route for Microsoft OAuth2 Callback
router.get("/oauth/callback", handleMicrosoftCallback);

module.exports = router;
