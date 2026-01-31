import { type ChildProcess, spawn } from "node:child_process";
import { createConfigFromEnv } from "./shared/config";
import { parseEnv } from "./shared/env";
import { logger } from "./shared/logger";
import {
  restoreProductionWebhook,
  setBotWebhook,
  setupShutdownHandlers,
  shutdownChildTiered,
} from "./shared/utils/dev-utils";

const WRANGLER_PORT = 8787;

async function main() {
  const env = parseEnv();
  const config = createConfigFromEnv(env);
  let wranglerProcess: ChildProcess | null = null;

  // Handle graceful shutdown
  setupShutdownHandlers(async () => {
    if (wranglerProcess) {
      await shutdownChildTiered(wranglerProcess);
    }
    await restoreProductionWebhook(config);
  });

  logger.info({ component: "Dev" }, "Starting local worker dev environment (Manual Tunnel Mode)...");

  // 1. Start Wrangler
  wranglerProcess = spawn("node_modules/.bin/wrangler", ["dev", "--port", String(WRANGLER_PORT)], {
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  // Listen for 'close' to ensure stdio is drained
  wranglerProcess.on("close", (code: number) => {
    logger.warn({ component: "Dev", code }, "Wrangler closed");
    process.exit(code);
  });

  // 2. Register Webhook if LOCAL_TUNNEL_URL is provided
  try {
    const localTunnelUrl = env.LOCAL_TUNNEL_URL;
    if (localTunnelUrl) {
      logger.info({ component: "Dev", localTunnelUrl }, "Using Manual Tunnel URL");
      await setBotWebhook(localTunnelUrl, config);
    } else {
      logger.warn({ component: "Dev" }, "No LOCAL_TUNNEL_URL provided. Webhook will NOT be updated.");
      logger.warn({ component: "Dev" }, "Set LOCAL_TUNNEL_URL in .env to enable auto-registration");
    }
  } catch (e) {
    logger.error({ component: "Dev", err: e }, "Error setting up local webhook");
  }
}

main().catch(console.error);
