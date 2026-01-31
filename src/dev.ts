import "dotenv/config";
import { createBot } from "./bot";
import { JoinRequestRepository } from "./infrastructure/persistence/JoinRequestRepository";
import { createStateStore, type StateStoreInterface } from "./infrastructure/persistence/state";
import { createConfigFromEnv } from "./shared/config";
import { parseEnv } from "./shared/env";
import { logger } from "./shared/logger";

async function main() {
  const env = parseEnv();

  if (env.MODE !== "dev") {
    logger.error({ component: "Dev" }, "This script is for development mode only. Set MODE=dev");
    process.exit(1);
  }

  const config = createConfigFromEnv(env);

  // Custom StateStore initialization for local dev with D1 emulation
  let store: StateStoreInterface;
  if (config.storageType === "d1" && !config.db) {
    logger.info({ component: "Dev" }, "STORAGE_TYPE=d1: Initializing local SQLite for D1 emulation...");
    try {
      const { Database } = require("bun:sqlite");
      const { drizzle } = require("drizzle-orm/bun-sqlite");
      const { D1StateStore } = require("./infrastructure/persistence/d1/D1StateStore");
      const fs = require("node:fs");
      const path = require("node:path");

      // Ensure directory exists
      const dbDir = ".data";
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      const dbPath = path.join(dbDir, "local-d1.sqlite");
      const sqlite = new Database(dbPath, { create: true });
      const db = drizzle(sqlite);

      logger.info({ component: "Dev", dbPath }, "Emulated D1 using local file");

      store = new D1StateStore(db);
      // biome-ignore lint/suspicious/noExplicitAny: D1StateStore has init
      await (store as any).init();
    } catch (e) {
      logger.error({ component: "Dev", err: e }, "Failed to emulate D1");
      logger.warn({ component: "Dev" }, "Falling back to standard createStateStore (Memory)");
      store = createStateStore(config);
    }
  } else {
    store = createStateStore(config);
  }
  const repo = new JoinRequestRepository(store, config);

  const bot = createBot(config, repo);

  // Delete webhook to allow getUpdates (long polling)
  try {
    await bot.api.deleteWebhook({
      drop_pending_updates: false,
    });
    logger.info({ component: "Dev" }, "Webhook deleted. Starting long polling...");
  } catch (error) {
    logger.error({ component: "Dev", err: error }, "Error deleting webhook");
    process.exit(1);
  }

  const { restoreProductionWebhook, setupShutdownHandlers } = await import("./shared/utils/dev-utils");

  // Handle graceful shutdown
  setupShutdownHandlers(async () => {
    logger.info({ component: "Dev" }, "Stopping bot...");
    await bot.stop();
    await restoreProductionWebhook(config);
  });

  // Start long polling
  // bot.start() registers its own signal handlers too, but ours will run.
  logger.info({ component: "Dev" }, "Bot is running in development mode");
  await bot.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
