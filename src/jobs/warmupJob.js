const cron = require('node-cron');
const { runWarmupJob } = require('../services/warmupService');
const { updateAllReputations } = require('../services/reputationService');
const { detectDeliveryStatus } = require('../services/warmupTrackingService');

const initializeWarmupJobScheduler = () => {
  // Run warmup job every minute
  cron.schedule('* * * * *', async () => {
    console.log('⏰ Running scheduled warmup job...');
    try {
      await runWarmupJob();
    } catch (error) {
      console.error('❌ Error in scheduled warmup job:', error.message);
    }
  });

  // Update reputation for all accounts every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('📊 Running scheduled reputation update...');
    try {
      await updateAllReputations();
    } catch (error) {
      console.error('❌ Error in scheduled reputation update:', error.message);
    }
  });

  // Check delivery status for pending warmup emails every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('📬 Running scheduled delivery status check...');
    try {
      const result = await detectDeliveryStatus(24); // Check last 24 hours
      console.log(`✅ Delivery status check complete: ${result.updated}/${result.checked} emails updated`);
    } catch (error) {
      console.error('❌ Error in delivery status check:', error.message);
    }
  });

  console.log('✅ Warmup job scheduler initialized (runs every minute)');
  console.log('✅ Reputation update scheduler initialized (runs every 6 hours)');
  console.log('✅ Delivery status check scheduler initialized (runs every 15 minutes)');
};

module.exports = {
  initializeWarmupJobScheduler,
};

