const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const warmupStatsController = require('../controllers/warmupStatsController');
const warmupJobController = require('../controllers/warmupJobController');
const warmupTrackingController = require('../controllers/warmupTrackingController');

router.get('/search', accountController.searchAccounts)
router.get('/', accountController.listAccounts);
router.post('/', accountController.createAccount);
router.post('/verify', accountController.verifyAccount);
router.get('/warmup/eligible', warmupJobController.listEligibleAccounts);
router.get('/warmup/dashboard', warmupJobController.getWarmupDashboard);

router.get('/:id/warmup/stats', warmupStatsController.getWarmupStats);
router.get('/:id/warmup/emails', warmupStatsController.getWarmupEmails);
router.get('/:id/warmup/job', warmupJobController.getWarmupJob);
router.post('/:id/warmup/enable', warmupJobController.enableWarmup);
router.post('/:id/warmup/disable', warmupJobController.disableWarmup);
router.post('/:id/warmup/pause', warmupJobController.pauseWarmup);
router.post('/:id/warmup/resume', warmupJobController.resumeWarmup);
router.post('/:id/warmup/reset-send-time', warmupJobController.resetNextSendTime);
router.put('/:id/warmup/job', warmupJobController.updateWarmupJob);
router.post('/:id/warmup/advance-step', warmupJobController.advanceStep);
router.post('/:id/warmup/track-delivery-status', warmupTrackingController.trackAccountDeliveryStatus);

// Warmup tracking routes
router.post('/warmup/emails/:warmupEmailId/track/open', warmupTrackingController.trackOpen);
router.post('/warmup/emails/:warmupEmailId/track/click', warmupTrackingController.trackClick);
router.post('/warmup/emails/:warmupEmailId/track/bounce', warmupTrackingController.trackBounce);
router.post('/warmup/emails/:warmupEmailId/track/spam', warmupTrackingController.trackSpamComplaint);
router.put('/warmup/emails/:warmupEmailId/track/delivery', warmupTrackingController.trackDeliveryStatus);
router.post('/warmup/check-delivery-status', warmupTrackingController.checkDeliveryStatus);
router.get('/warmup/track/open', warmupTrackingController.trackOpenByTag);
router.get('/warmup/track/click', warmupTrackingController.trackClickByTag);

router.get('/:id', accountController.getAccountById);
router.put('/:id', accountController.updateAccount);
router.put('/:id/warmup', accountController.updateWarmupSettings);
router.delete('/:id', accountController.deleteAccount);

module.exports = router;
