import { webhookCallback } from "grammy";
import { Bot, session, Context, SessionFlavor } from "grammy";
import { Redis } from "@upstash/redis";

interface SessionData {
  history: string[];
}

type MyContext = Context & SessionFlavor<SessionData>;

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is unset");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const bot = new Bot<MyContext>(token);

bot.use(
  session({
    initial: (): SessionData => ({ history: [] }),
    storage: {
      read: async (key: string) => {
        try {
          const data = await redis.get(`session:${key}`);
          if (!data) return undefined;
          return typeof data === "string" ? JSON.parse(data) : data;
        } catch {
          return undefined;
        }
      },
      write: async (key: string, value: SessionData) => {
        try {
          await redis.setex(`session:${key}`, 604800, JSON.stringify(value));
        } catch { }
      },
      delete: async (key: string) => {
        try {
          await redis.del(`session:${key}`);
        } catch { }
      },
    },
    getSessionKey: (ctx) => (ctx.from ? String(ctx.from.id) : undefined),
  })
);

bot.on("message:text", async (ctx) => {
  ctx.session.history.push(ctx.message.text);
  if (ctx.session.history.length > 20) {
    ctx.session.history = ctx.session.history.slice(-20);
  }
  await ctx.reply(`Saved! I now remember ${ctx.session.history.length} messages.`);
});

const handler = webhookCallback(bot, "std/http");

export const config = {
  runtime: "edge",
};

export default async (req: Request): Promise<Response> => {
  try {
    return await handler(req);
  } catch (error) {
    console.error("Error handling webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
