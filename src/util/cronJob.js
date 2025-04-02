const cron = require("node-cron");
const { fetchAndSaveMessages } = require("../services/message.service");
const Account = require("./../models/account");
const { fetchAndSaveMailboxes } = require("../services/mailboxService");

const scheduleFetchMessages = () => {
  cron.schedule("*/20 * * * *", async () => {
    console.log("🔄 Fetching and saving messages...");

    try {
      const accounts = await Account.find({});

      for (const account of accounts) {
        console.log(`📬 Fetching messages for account ${account._id}`);
        console.log(
          `Processing OAuth account: ${account._id} (${account.type})`
        );

        await fetchAndSaveMailboxes(account);
        console.log(`Mailboxes saved for account: ${account._id}`);
        await fetchAndSaveMessages(account);
      }

      console.log("✅ Successfully fetched and saved all messages.");
    } catch (error) {
      console.error("❌ Error during scheduled job:", error.message);
    }
  });
};

scheduleFetchMessages();
