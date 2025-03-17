const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');

router.get('/search', accountController.searchAccounts)
router.get('/', accountController.listAccounts);
router.post('/', accountController.createAccount);
router.get('/:id', accountController.getAccountById);
router.put('/:id', accountController.updateAccount);
router.delete('/:id', accountController.deleteAccount);
router.post('/verify', accountController.verifyAccount);

module.exports = router;
