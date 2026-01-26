import "dotenv/config";

async function main() {
  try {
    // Import env - our new Proxy in env.ts will handle loading .env via dotenv/config
    const { env } = await import("../env");

    // GUARD: Only run automatically in CI (Cloudflare Pages/Workers build) or if explicitly forced
    // This prevents local 'bun install' from accidentally setting production webhooks
    const isCI = process.env.CI === "true" || process.env.CF_PAGES === "1";
    const isForced = process.argv.includes("--force");

    if (!isCI && !isForced) {
      console.log("ℹ️ Skipping webhook setup (not running in CI). Use --force to override.");
      process.exit(0); // Exit successfully to not break install
    }

    // Check if we have the minimum required to set a webhook
    if (!env.BOT_TOKEN) {
      console.error("❌ BOT_TOKEN is missing from environment");
      process.exit(1);
    }

    const baseUrl = env.PUBLIC_BASE_URL;
    const webhookPath = env.WEBHOOK_PATH;
    const secretToken = env.WEBHOOK_SECRET_TOKEN;

    if (!baseUrl) {
      console.error("❌ PUBLIC_BASE_URL is missing. Cannot set webhook.");
      console.log("Example: https://testgruppe-bot.janwer.workers.dev");
      process.exit(1);
    }

    const { createBot } = await import("../bot");
    const bot = createBot();
    const webhookUrl = `${baseUrl}${webhookPath}`;

    console.log(`🚀 Setting webhook to: ${webhookUrl}`);

    const result = await bot.api.setWebhook(webhookUrl, {
      secret_token: secretToken,
      drop_pending_updates: true,
    });

    if (result) {
      console.log(`✅ Webhook set successfully!`);

      // Verify webhook info
      const info = await bot.api.getWebhookInfo();
      console.log("\n--- Telegram Webhook Info ---");
      console.log(JSON.stringify(info, null, 2));
      console.log("-----------------------------\n");
    } else {
      console.error("❌ Telegram API returned false for setWebhook");
      process.exit(1);
    }
  } catch (error: any) {
    console.error("❌ Fatal error setting webhook:");
    if (error?.name === "ZodError") {
      console.error(JSON.stringify(error.errors, null, 2));
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main();