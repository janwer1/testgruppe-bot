import type { D1Database } from "@cloudflare/workers-types";
import { type Bot, webhookCallback } from "grammy";
import { createBot } from "./bot";
import { JoinRequestRepository } from "./infrastructure/persistence/JoinRequestRepository";
import { createStateStore } from "./infrastructure/persistence/state";
import { createConfigFromEnv } from "./shared/config";
import { parseEnv } from "./shared/env";
import { logger } from "./shared/logger";
import { createHealthCheckResponse } from "./shared/utils/http";
import type { BotContext } from "./types";

let bot: Bot<BotContext>;
let handler: (req: Request) => Promise<Response>;

export default {
  async fetch(request: Request, cfEnv: unknown, _ctx: unknown): Promise<Response> {
    // Initialize environment with Cloudflare bindings
    const env = parseEnv(cfEnv as Record<string, string | undefined>);
    const db = (cfEnv as { DB: D1Database }).DB;
    const config = createConfigFromEnv(env, db);

    const url = new URL(request.url);
    logger.info({ component: "Worker", method: request.method, path: url.pathname }, "Incoming Request");

    // Webhook endpoint
    if (url.pathname === config.webhookPath) {
      if (request.method === "GET") {
        return createHealthCheckResponse();
      }

      try {
        // Lazy initialization of bot and handler using the current request's config
        if (!bot) {
          const store = createStateStore(config);

          // Auto-initialize D1 table if supported
          if ("init" in store && typeof (store as { init?: unknown }).init === "function") {
            logger.info({ component: "Worker" }, "Initializing StateStore...");
            // biome-ignore lint/suspicious/noExplicitAny: StateStore might have optional init
            await (store as any).init();
          }

          const repo = new JoinRequestRepository(store, config);
          bot = createBot(config, repo);
          handler = webhookCallback(bot, "std/http", {
            secretToken: config.webhookSecretToken,
          });
        }

        return await handler(request);
      } catch (error) {
        logger.error({ err: error }, "❌ Error handling webhook");
        return new Response(`Internal Server Error: ${error instanceof Error ? error.message : String(error)}`, {
          status: 500,
        });
      }
    }

    // Health check endpoints
    if (url.pathname === "/" || url.pathname === "/api" || url.pathname === "/api/index") {
      return createHealthCheckResponse();
    }

    return new Response("Not Found", { status: 404 });
  },
};
