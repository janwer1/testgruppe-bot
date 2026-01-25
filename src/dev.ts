import "dotenv/config";
import { createBot } from "./bot";
import { env } from "./env";

async function main() {
  if (env.MODE !== "dev") {
    console.error("This script is for development mode only. Set MODE=dev");
    process.exit(1);
  }

  const bot = createBot();

  // Store original webhook info to restore on exit
  let originalWebhook: any | undefined;
  try {
    originalWebhook = await bot.api.getWebhookInfo();
    if (originalWebhook.url) {
      console.log(`ℹ️  Found existing webhook: ${originalWebhook.url}`);
    }
  } catch (error) {
    console.warn("⚠️  Failed to check existing webhook info:", error);
  }

  // Delete webhook to allow getUpdates (long polling)
  try {
    await bot.api.deleteWebhook({
      drop_pending_updates: env.DROP_PENDING_UPDATES_ON_DEV_START,
    });
    console.log("✅ Webhook deleted. Starting long polling...");
  } catch (error) {
    console.error("❌ Error deleting webhook:", error);
    process.exit(1);
  }

  // Handle graceful shutdown
  const cleanup = async () => {
    console.log("\n🛑 Stopping bot...");
    await bot.stop();

    if (originalWebhook?.url) {
      console.log(`🔄 Restoring webhook to: ${originalWebhook.url}`);
      try {
        await bot.api.setWebhook(originalWebhook.url, {
          ip_address: originalWebhook.ip_address,
          max_connections: originalWebhook.max_connections,
          allowed_updates: originalWebhook.allowed_updates,
          drop_pending_updates: false,
          secret_token: env.WEBHOOK_SECRET_TOKEN,
        });
        console.log("✅ Webhook restored.");
      } catch (error) {
        console.error("❌ Failed to restore webhook:", error);
      }
    }
    process.exit(0);
  };

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  // Start long polling
  // bot.start() registers its own signal handlers too, but ours will run.
  console.log(`🤖 Bot is running in development mode`);
  await bot.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
