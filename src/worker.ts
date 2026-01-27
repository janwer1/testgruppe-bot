import { type Bot, webhookCallback } from "grammy";
import { createBot } from "./bot";
import { createConfigFromEnv } from "./config";
import { parseEnv } from "./env";
import { JoinRequestRepository } from "./repositories/JoinRequestRepository";
import { createStateStore } from "./services/state";
import type { BotContext } from "./types";
import { createHealthCheckResponse } from "./utils/http";

let bot: Bot<BotContext>;
let handler: (req: Request) => Promise<Response>;

export default {
  async fetch(request: Request, cfEnv: unknown, _ctx: unknown): Promise<Response> {
    // Initialize environment with Cloudflare bindings
    const env = parseEnv(cfEnv as Record<string, string | undefined>);
    const config = createConfigFromEnv(env);

    const url = new URL(request.url);

    // Webhook endpoint
    if (url.pathname === config.webhookPath) {
      if (request.method === "GET") {
        return createHealthCheckResponse();
      }

      try {
        // Lazy initialization of bot and handler using the current request's config
        // strict singleton pattern might be tricky if config changes (unlikely in worker but possible with env bindings)
        // For simplicity and safety in Workers, we can recreate or use a singleton if we are sure config is stable.
        // Given standard Worker lifecycle, recreating is safe but expensive.
        // Let's implement lazy singleton that updates if config changes? No, config comes from cfEnv.

        if (!bot) {
          const store = createStateStore(config);
          const repo = new JoinRequestRepository(store, config);
          bot = createBot(config, repo);
          handler = webhookCallback(bot, "std/http", {
            secretToken: config.webhookSecret,
          });
        }

        return await handler(request);
      } catch (error) {
        console.error("Error handling webhook:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    }

    // Health check endpoints
    if (url.pathname === "/" || url.pathname === "/api" || url.pathname === "/api/index") {
      return createHealthCheckResponse();
    }

    return new Response("Not Found", { status: 404 });
  },
};
