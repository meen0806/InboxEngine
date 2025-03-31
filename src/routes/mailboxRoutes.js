const express = require('express');
const router = express.Router();
const {
  getMailboxes,
  getMessages,
  getMessageById,
  deleteMessages,
  searchMessages,
  getAttachment,
  deliveryTest,
  loadMessages,
  loadMailbox,
  sendTestEmail,
} = require('../controllers/mailboxController');


router.get("/messages/:account/:mailbox", getMessages);
router.get('/:account/mailboxes', getMailboxes);

// router.get('/:account/messages', getMessages);
router.get('/:account/message/:message', getMessageById);
router.delete('/:account/messages/delete', deleteMessages);
router.post('/:account/search', searchMessages);
router.get('/:account/attachment/:attachment', getAttachment);
router.get('/delivery-test/check/:deliveryTest', deliveryTest);
router.post('/:account/load-messages', loadMessages);
router.post('/:account/loadmailboxes', loadMailbox);
router.post("/send-test-email", sendTestEmail)

module.exports = router;
