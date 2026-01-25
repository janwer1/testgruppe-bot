import { webhookCallback } from "grammy";
import { createBot } from "../src/bot";

export const config = {
  runtime: "edge",
};

const bot = createBot();

const handler = webhookCallback(bot, "std/http");

export default async (req: Request): Promise<Response> => {
  try {
    return await handler(req);
  } catch (error) {
    console.error("Error handling webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
