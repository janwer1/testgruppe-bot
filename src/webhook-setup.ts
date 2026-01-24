import "dotenv/config";
import { createBot } from "./bot";
import { env } from "./env";

async function main() {
  if (env.MODE !== "prod") {
    console.error("This script is for production mode only. Set MODE=prod");
    process.exit(1);
  }

  if (!env.PUBLIC_BASE_URL || !env.WEBHOOK_PATH || !env.WEBHOOK_SECRET_TOKEN) {
    console.error(
      "PUBLIC_BASE_URL, WEBHOOK_PATH, and WEBHOOK_SECRET_TOKEN are required"
    );
    process.exit(1);
  }

  const bot = createBot();
  const webhookUrl = `${env.PUBLIC_BASE_URL}${env.WEBHOOK_PATH}`;

  try {
    const result = await bot.api.setWebhook(webhookUrl, {
      secret_token: env.WEBHOOK_SECRET_TOKEN,
      drop_pending_updates: true,
    });

    if (result) {
      console.log(`✅ Webhook set successfully: ${webhookUrl}`);
      
      // Verify webhook info
      const info = await bot.api.getWebhookInfo();
      console.log("Webhook info:", JSON.stringify(info, null, 2));
    } else {
      console.error("Failed to set webhook");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error setting webhook:", error);
    process.exit(1);
  }

  process.exit(0);
}

main();
