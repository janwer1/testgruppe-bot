import { webhookCallback, Bot } from "grammy";
import { createBot } from "./bot";
import { createHealthCheckResponse } from "./utils/http";
import { env, initEnv } from "./env";
import { BotContext } from "./types";

let bot: Bot<BotContext>;
let handler: ReturnType<typeof webhookCallback>;

function getBotAndHandler() {
    if (!bot) {
        bot = createBot();
        handler = webhookCallback(bot, "std/http", {
            secretToken: env.WEBHOOK_SECRET_TOKEN,
        });
    }
    return { bot, handler };
}

export default {
    async fetch(request: Request, cfEnv: any, _ctx: any): Promise<Response> {
        // Initialize environment with Cloudflare bindings
        initEnv(cfEnv);

        const url = new URL(request.url);

        // Webhook endpoint
        if (url.pathname === env.WEBHOOK_PATH) {
            if (request.method === "GET") {
                return createHealthCheckResponse();
            }

            try {
                const { handler } = getBotAndHandler();
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
    }
};