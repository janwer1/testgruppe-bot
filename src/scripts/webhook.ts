import "dotenv/config";

async function getWebhook() {
  const { parseEnv } = await import("../env");
  const { createConfigFromEnv } = await import("../config");
  const { createStateStore } = await import("../services/state");
  const { JoinRequestRepository } = await import("../repositories/JoinRequestRepository");
  const { createBot } = await import("../bot");

  const env = parseEnv();
  const config = createConfigFromEnv(env);

  if (!config.botToken) {
    console.log("ℹ️ Skipping webhook status fetch (BOT_TOKEN missing)");
    return;
  }
  const store = createStateStore(config);
  const repo = new JoinRequestRepository(store, config);
  const bot = createBot(config, repo);

  console.log("🔍 Fetching webhook info from Telegram...");
  const info = await bot.api.getWebhookInfo();

  console.log("\n--- Webhook Status ---");
  console.log(JSON.stringify(info, null, 2));
  console.log("----------------------\n");

  if (info.url) {
    console.log(`✅ Webhook is ACTIVE: ${info.url}`);
  } else {
    console.log("ℹ️  No webhook set (using long polling or inactive)");
  }
}

async function setupWebhook(force = false) {
  const { parseEnv } = await import("../env");
  const { createConfigFromEnv } = await import("../config");
  const { Bot } = await import("grammy");

  const isCI = process.env.CI === "true" || process.env.CF_PAGES === "1";

  if (!isCI && !force) {
    console.log("ℹ️ Skipping webhook setup (not running in CI). Use --force to override.");
    return;
  }

  const env = parseEnv();
  const config = createConfigFromEnv(env);

  if (!config.botToken || !config.webhookUrl || !config.webhookSecretToken) {
    if (isCI) {
      throw new Error(
        "❌ CI Environment: BOT_TOKEN, PUBLIC_BASE_URL, or WEBHOOK_SECRET_TOKEN is missing. Webhook setup failed.",
      );
    }
    console.log("ℹ️ Skipping webhook setup: BOT_TOKEN, PUBLIC_BASE_URL, or WEBHOOK_SECRET_TOKEN is missing.");
    return;
  }

  const bot = new Bot(config.botToken);

  if (!config.webhookUrl) {
    throw new Error("PUBLIC_BASE_URL (webhookUrl) is missing");
  }

  const webhookUrl = new URL(config.webhookPath, config.webhookUrl).toString();
  const maskedSecret =
    config.webhookSecretToken.substring(0, 3) + "*".repeat(Math.max(0, config.webhookSecretToken.length - 3));

  console.log(`🚀 Setting webhook to: ${webhookUrl}`);
  console.log(`🔒 Using secret token: ${maskedSecret}`);

  const result = await bot.api.setWebhook(webhookUrl, {
    secret_token: config.webhookSecretToken,
    drop_pending_updates: true,
  });

  if (result) {
    console.log(`✅ Webhook set successfully!`);
    const info = await bot.api.getWebhookInfo();
    console.log("\n--- Telegram Webhook Info ---");
    console.log(JSON.stringify(info, null, 2));
    console.log("-----------------------------\n");
  } else {
    throw new Error("Telegram API returned false for setWebhook");
  }
}

async function testWebhook() {
  const { parseEnv } = await import("../env");
  const { createConfigFromEnv } = await import("../config");

  const env = parseEnv();
  const config = createConfigFromEnv(env);
  const baseUrl = config.webhookUrl || "http://localhost:8787";
  const url = new URL(config.webhookPath, baseUrl).toString();

  console.log(`🚀 Simulating Telegram webhook call to: ${url}`);
  if (!config.webhookSecretToken) {
    console.warn("⚠️  Warning: WEBHOOK_SECRET_TOKEN is not set in env");
  }

  const payload = {
    update_id: Math.floor(Math.random() * 1000000),
    message: {
      message_id: 123,
      from: {
        id: 123456789,
        is_bot: false,
        first_name: "Test",
        username: "testuser",
      },
      chat: { id: 123456789, type: "private", first_name: "Test" },
      date: Math.floor(Date.now() / 1000),
      text: "/start",
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": config.webhookSecretToken!, // Guaranteed to be defined by validation above
    },
    body: JSON.stringify(payload),
  });

  console.log(`\nResponse Status: ${response.status} ${response.statusText}`);
  const text = await response.text();
  console.log("Response Body:", text || "(empty)");

  if (response.ok) {
    console.log("\n✅ Webhook processed successfully!");
  } else {
    throw new Error("Webhook failed!");
  }
}

async function main() {
  const command = process.argv[2];
  const force = process.argv.includes("--force");

  try {
    switch (command) {
      case "get":
        await getWebhook();
        break;
      case "setup":
        await setupWebhook(force);
        break;
      case "test":
        await testWebhook();
        break;
      default:
        console.log("Usage: bun src/scripts/webhook.ts [get|setup|test] [--force]");
        process.exit(1);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error in ${command || "main"}:`, errorMessage);
    process.exit(1);
  }
}

main();
