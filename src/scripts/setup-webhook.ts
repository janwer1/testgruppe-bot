import "dotenv/config";

async function main() {
  try {
    // Dynamic import to prevent crash on local install if env vars are missing
    // validating env vars will run when this module is imported
    const { env } = await import("../env");

    if (env.MODE !== "prod") {
      console.log("ℹ️  Skipping webhook setup: MODE is not 'prod'");
      process.exit(0);
    }

    if (!env.PUBLIC_BASE_URL || !env.WEBHOOK_PATH || !env.WEBHOOK_SECRET_TOKEN) {
      console.warn(
        "⚠️  Skipping webhook setup: PUBLIC_BASE_URL, WEBHOOK_PATH, or WEBHOOK_SECRET_TOKEN missing"
      );
      process.exit(0);
    }

    // Dynamic import to avoid loading bot/dependencies if env checks fail
    const { createBot } = await import("../bot");
    const bot = createBot();
    const webhookUrl = `${env.PUBLIC_BASE_URL}${env.WEBHOOK_PATH}`;

    console.log(`Setting webhook to: ${webhookUrl}`);

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
      console.error("❌ Failed to set webhook");
      process.exit(1);
    }
  } catch (error: any) {
    // Check if it's likely an env validation error
    if (error?.name === "ZodError" || error?.message?.includes("environment variables")) {
      console.warn("⚠️  Skipping webhook setup: Environment validation failed (likely missing vars in local/build environment).");
      // We exit gracefully because this runs on postinstall
      process.exit(0);
    }

    console.error("❌ Error setting webhook:", error);
    // If it's an unexpected error, we might want to fail? 
    // But for postinstall, failing breaks the build. Best to be safe and warn.
    // However, if we are in PROD and it fails, we probably want to know.
    // But we can't easily distinguish "Real Prod" vs "Building for Prod" vs "Local Install".
    // Relying on the logs.
    process.exit(0);
  }
}

main();
