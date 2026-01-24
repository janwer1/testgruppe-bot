import "dotenv/config";
import { createBot } from "./bot";
import { env } from "./env";

// This is a simple entry point that can be used for basic testing
// For development, use src/dev.ts
// For production, use src/vercel.ts

const bot = createBot();

console.log("🤖 Bot starting...");
bot.start();
