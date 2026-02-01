import type { ChildProcess } from "node:child_process";
import { Bot } from "grammy";
import type { BotConfig } from "../config";
import { logger } from "../logger";

/**
 * Restores the production webhook with a 3-second timeout.
 */
export async function restoreProductionWebhook(config: BotConfig) {
  if (!config.botToken || !config.webhookUrl) {
    logger.warn({ component: "Dev" }, "Cannot restore webhook: BOT_TOKEN or PUBLIC_BASE_URL not set");
    return;
  }

  const prodUrl = new URL(config.webhookPath, config.webhookUrl).toString();
  const bot = new Bot(config.botToken);

  logger.info({ component: "Dev", prodUrl }, "Restoring production webhook");

  const restore = async () => {
    try {
      await bot.api.setWebhook(prodUrl, {
        secret_token: config.webhookSecretToken,
        drop_pending_updates: false,
        allowed_updates: ["message", "callback_query", "chat_join_request", "my_chat_member"],
      });
      logger.info({ component: "Dev", prodUrl }, "Webhook restored successfully");
    } catch (e) {
      logger.error({ component: "Dev", err: e, prodUrl }, "Failed to restore webhook");
    }
  };

  const timeout = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms));

  try {
    await Promise.race([restore(), timeout(3000)]);
  } catch (e) {
    if (e instanceof Error && e.message === "Timeout") {
      logger.warn({ component: "Dev" }, "Webhook restoration timed out after 3s");
    } else {
      logger.error({ component: "Dev", err: e }, "Unexpected error during webhook restoration");
    }
  }
}

/**
 * Sets up standard signal and error handlers for graceful shutdown (restore webhook on exit).
 */
export function setupShutdownHandlers(cleanup: (signal: string) => Promise<void>) {
  let isShuttingDown = false;

  const wrapper = async (signal: string, exitCode: number = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ component: "Dev", signal }, "Shutting down");
    await cleanup(signal);
    process.exit(exitCode);
  };

  process.on("SIGINT", () => wrapper("SIGINT"));
  process.on("SIGTERM", () => wrapper("SIGTERM"));
  process.on("uncaughtException", (err) => {
    logger.error({ component: "Dev", err }, "Uncaught exception");
    wrapper("uncaughtException", 1);
  });
  process.on("unhandledRejection", (reason, promise) => {
    logger.error({ component: "Dev", reason, promise }, "Unhandled rejection");
    wrapper("unhandledRejection", 1);
  });
}

/**
 * Performs a tiered shutdown of a child process (SIGINT -> SIGTERM -> SIGKILL).
 */
export async function shutdownChildTiered(child: ChildProcess) {
  if (!child || child.killed) return;

  const waitForExit = (ms: number) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      const onExit = () => {
        clearTimeout(timer);
        resolve(true);
      };
      child.once("exit", onExit);
    });

  logger.info({ component: "Dev" }, "Sending SIGINT to child process...");
  child.kill("SIGINT");
  if (await waitForExit(3000)) return;

  if (child.killed) return;
  logger.info({ component: "Dev" }, "Escalating to SIGTERM...");
  child.kill("SIGTERM");
  if (await waitForExit(3000)) return;

  if (child.killed) return;
  logger.info({ component: "Dev" }, "Hard kill with SIGKILL...");
  child.kill("SIGKILL");
}

/**
 * Registers a webhook (used for both development tunnels and production).
 */
export async function setBotWebhook(baseUrl: string, config: BotConfig) {
  if (!config.botToken) {
    logger.error({ component: "Dev" }, "BOT_TOKEN is missing from environment.");
    return;
  }

  const webhookUrl = new URL(config.webhookPath, baseUrl).toString();
  const cleanSecret = config.webhookSecretToken?.trim();

  const payload = {
    url: webhookUrl,
    secret_token: cleanSecret,
    drop_pending_updates: false,
    allowed_updates: ["message", "callback_query", "chat_join_request", "my_chat_member"],
  };

  logger.info({ component: "Dev", webhookUrl }, "Registering Development Webhook");

  const apiUrl = `https://api.telegram.org/bot${config.botToken}/setWebhook`;

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await res.json()) as {
      ok: boolean;
      error_code?: number;
      description?: string;
    };
    if (result.ok) {
      logger.info({ component: "Dev" }, "Webhook active!");
    } else {
      logger.error(
        { component: "Dev", errorCode: result.error_code, description: result.description },
        "Webhook failed",
      );
    }
  } catch (e) {
    logger.error({ component: "Dev", err: e }, "Webhook request failed");
  }
}
