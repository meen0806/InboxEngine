const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');

router.get('/list', accountController.listAccounts);
router.post('/', accountController.createAccount);
router.get('/:id', accountController.getAccountById);
router.put('/:id', accountController.updateAccount);
router.delete('/:id', accountController.deleteAccount);
router.post('/verify', accountController.verifyAccount);
router.get('/', accountController.srchAccounts);

module.exports = router;
