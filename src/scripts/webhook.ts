import "dotenv/config";
import { logger } from "../shared/logger";

async function getWebhook() {
  const { parseEnv } = await import("../shared/env");
  const { createConfigFromEnv } = await import("../shared/config");
  const { createStateStore } = await import("../infrastructure/persistence/state");
  const { JoinRequestRepository } = await import("../infrastructure/persistence/JoinRequestRepository");
  const { createBot } = await import("../bot");

  const env = parseEnv();
  const config = createConfigFromEnv(env);

  if (!config.botToken) {
    logger.info({ component: "Webhook" }, "Skipping webhook status fetch (BOT_TOKEN missing)");
    return;
  }
  const store = createStateStore(config);
  const repo = new JoinRequestRepository(store, config);
  const bot = createBot(config, repo);

  logger.info({ component: "Webhook" }, "Fetching webhook info from Telegram...");
  const info = await bot.api.getWebhookInfo();

  console.log("\n--- Webhook Status ---");
  console.log(JSON.stringify(info, null, 2));
  console.log("----------------------\n");

  if (info.url) {
    logger.info({ component: "Webhook", url: info.url }, "Webhook is ACTIVE");
  } else {
    logger.info({ component: "Webhook" }, "No webhook set (using long polling or inactive)");
  }
}

async function setupWebhook(force = false) {
  const { parseEnv } = await import("../shared/env");
  const { createConfigFromEnv } = await import("../shared/config");

  const isCI = process.env.CI === "true" || process.env.CF_PAGES === "1";

  if (!isCI && !force) {
    logger.info({ component: "Webhook" }, "Skipping webhook setup (not running in CI). Use --force to override.");
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
    logger.info(
      { component: "Webhook" },
      "Skipping webhook setup: BOT_TOKEN, PUBLIC_BASE_URL, or WEBHOOK_SECRET_TOKEN is missing.",
    );
    return;
  }

  const { setBotWebhook } = await import("../shared/utils/dev-utils");

  if (!config.webhookUrl) {
    throw new Error("PUBLIC_BASE_URL (webhookUrl) is missing");
  }

  await setBotWebhook(config.webhookUrl, config);
}

async function testWebhook() {
  const { parseEnv } = await import("../shared/env");
  const { createConfigFromEnv } = await import("../shared/config");

  const env = parseEnv();
  const config = createConfigFromEnv(env);
  const baseUrl = config.webhookUrl || "http://localhost:8787";
  const url = new URL(config.webhookPath, baseUrl).toString();

  logger.info({ component: "Webhook", url }, "Simulating Telegram webhook call");
  if (!config.webhookSecretToken) {
    logger.warn({ component: "Webhook" }, "Warning: WEBHOOK_SECRET_TOKEN is not set in env");
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
      "X-Telegram-Bot-Api-Secret-Token": config.webhookSecretToken || "",
    },
    body: JSON.stringify(payload),
  });

  logger.info({ component: "Webhook", status: response.status, statusText: response.statusText }, "Webhook Response");
  const text = await response.text();
  logger.info({ component: "Webhook" }, `Response Body: ${text || "(empty)"}`);

  if (response.ok) {
    logger.info({ component: "Webhook" }, "Webhook processed successfully!");
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
    logger.error({ component: "Webhook", command: command || "main" }, errorMessage);
    process.exit(1);
  }
}

main();
