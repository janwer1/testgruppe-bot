import { webhookCallback } from "grammy";
import { createBot } from "./bot";
import { env } from "./env";

if (env.MODE !== "prod") {
  throw new Error("This handler is for production mode only. Set MODE=prod");
}

if (!env.PUBLIC_BASE_URL || !env.WEBHOOK_PATH || !env.WEBHOOK_SECRET_TOKEN) {
  throw new Error(
    "PUBLIC_BASE_URL, WEBHOOK_PATH, and WEBHOOK_SECRET_TOKEN are required for production mode"
  );
}

const bot = createBot();

// Validate webhook secret token
function validateWebhook(req: Request): boolean {
  const secretToken = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  return secretToken === env.WEBHOOK_SECRET_TOKEN;
}

// Export Vercel serverless function handler
export default async (req: Request): Promise<Response> => {
  // Validate webhook secret
  if (!validateWebhook(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const handler = webhookCallback(bot, "std/http");
    return await handler(req);
  } catch (error) {
    console.error("Error handling webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
