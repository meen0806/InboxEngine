
const express = require("express");
const outlookControllers=require("./../controllers/outlookController")
const router = express.Router();

router.get("/auth-url", outlookControllers.getMicrosoftAuthUrl);
router.get("/callback", outlookControllers.handleMicrosoftCallback);

module.exports = router;
