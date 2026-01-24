import "dotenv/config";
import { createBot } from "./bot";
import { env } from "./env";

async function main() {
  if (env.MODE !== "dev") {
    console.error("This script is for development mode only. Set MODE=dev");
    process.exit(1);
  }

  const bot = createBot();

  // Delete webhook to allow getUpdates (long polling)
  try {
    await bot.api.deleteWebhook({
      drop_pending_updates: env.DROP_PENDING_UPDATES_ON_DEV_START,
    });
    console.log("Webhook deleted. Starting long polling...");
  } catch (error) {
    console.error("Error deleting webhook:", error);
    process.exit(1);
  }

  // Start long polling
  bot.start();
  console.log("🤖 Bot is running in development mode (long polling)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
