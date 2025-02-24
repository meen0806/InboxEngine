
const express = require("express");
const outlookControllers=require("./../controllers/outlookController")
const router = express.Router();

// Route for Microsoft OAuth2 Authentication URL
router.get("/auth-url", outlookControllers.getMicrosoftAuthUrl);

// Route for Microsoft OAuth2 Callback
router.get("/callback", outlookControllers.handleMicrosoftCallback);

module.exports = router;
