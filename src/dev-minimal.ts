import { Bot, session, Context } from "grammy";
import { Redis } from "@upstash/redis";

interface MinimalSessionData {
  history: string[];
}

type BotContext = Context & { session: MinimalSessionData };

if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN is required");
}

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required");
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function createSafeStorage(redis: Redis) {
  return {
    async read(key: string): Promise<MinimalSessionData | undefined> {
      try {
        const raw = await redis.get(key);
        if (raw === null || raw === undefined) return undefined;
        if (typeof raw === "string") {
          return JSON.parse(raw) as MinimalSessionData;
        }
        return raw as MinimalSessionData;
      } catch (err) {
        console.warn(`Session read error for ${key}, clearing:`, err);
        try {
          await this.delete(key);
        } catch {}
        return undefined;
      }
    },
    async write(key: string, value: MinimalSessionData): Promise<void> {
      await redis.set(key, JSON.stringify(value));
    },
    async delete(key: string): Promise<void> {
      await redis.del(key);
    },
  };
}

const safeStorage = createSafeStorage(redis);

const bot = new Bot<BotContext>(process.env.BOT_TOKEN);

bot.use(
  session({
    initial: (): MinimalSessionData => ({ history: [] }),
    storage: safeStorage as any,
    getSessionKey: (ctx) => (ctx.from ? String(ctx.from.id) : undefined),
  })
);

bot.catch((err) => {
  console.error("Bot error:", err.error);
});

bot.on("message:text", async (ctx) => {
  if (!ctx.session || !Array.isArray(ctx.session.history)) {
    ctx.session = { history: [] };
  }
  ctx.session.history.push(ctx.message.text);

  if (ctx.session.history.length > 20) {
    ctx.session.history = ctx.session.history.slice(-20);
  }

  await ctx.reply(`Saved! I now remember ${ctx.session.history.length} messages.`);
});

console.log("Starting minimal bot in long polling mode...");
bot.start();
