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
  loadThreads,
  sendTestEmail,
  getThreads,
  getThreadById,
  SendReplyEmail,
  MarkThreadReaded
} = require('../controllers/mailboxController');

router.get('/:account/mailboxes', getMailboxes);
router.get('/:account/:mailbox/messages', getMessages);
router.get('/:account/allThreads', getThreads)
router.get('/:account/message/:message', getMessageById);
router.get("/:account/thread/:threadId", getThreadById)
router.delete('/:account/messages/delete', deleteMessages);
router.post('/:account/search', searchMessages);
router.get('/:account/attachment/:attachment', getAttachment);
router.get('/delivery-test/check/:deliveryTest', deliveryTest);
router.post('/:account/load-messages', loadMessages);
router.post('/:account/load-threads', loadThreads);
router.post('/:account/loadmailboxes', loadMailbox);
router.post("/send-test-email", sendTestEmail)
router.post("/send-reply-email", SendReplyEmail)
router.patch('/message/read-thread', MarkThreadReaded)
module.exports = router;
