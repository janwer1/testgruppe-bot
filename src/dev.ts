import "dotenv/config";
import { createBot } from "./bot";
import { createConfigFromEnv } from "./config";
import { parseEnv } from "./env";
import { JoinRequestRepository } from "./repositories/JoinRequestRepository";
import { createStateStore } from "./services/state";

async function main() {
  const env = parseEnv();

  if (env.MODE !== "dev") {
    console.error("This script is for development mode only. Set MODE=dev");
    process.exit(1);
  }

  const config = createConfigFromEnv(env);
  const store = createStateStore(config);
  const repo = new JoinRequestRepository(store, config);

  const bot = createBot(config, repo);

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

    // Always restore webhook on exit (using env vars)
    if (config.webhookUrl && env.WEBHOOK_PATH) {
      const webhookUrl = `${config.webhookUrl}${env.WEBHOOK_PATH}`;
      console.log(`🔄 Restoring webhook to: ${webhookUrl}`);
      try {
        await bot.api.setWebhook(webhookUrl, {
          secret_token: config.webhookSecret,
          drop_pending_updates: false,
        });
        console.log("✅ Webhook restored.");
      } catch (error) {
        console.error("❌ Failed to restore webhook:", error);
      }
    } else {
      console.warn("⚠️  Cannot restore webhook: PUBLIC_BASE_URL or WEBHOOK_PATH not set");
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
