import type { Env } from "./env";

export function createConfigFromEnv(env: Env, db?: D1Database) {
  const requireEnv = <T>(val: T | undefined, name: string): T => {
    if (val === undefined) throw new Error(`${name} is required in runtime config`);
    return val;
  };

  return {
    adminReviewChatId: requireEnv(env.ADMIN_REVIEW_CHAT_ID, "ADMIN_REVIEW_CHAT_ID"),
    botToken: env.BOT_TOKEN,
    joinLink: requireEnv(env.JOIN_LINK, "JOIN_LINK"),
    maxReasonChars: env.MAX_REASON_CHARS ?? 1000,
    minReasonWords: env.MIN_REASON_WORDS ?? 10,
    targetChatId: requireEnv(env.TARGET_CHAT_ID, "TARGET_CHAT_ID"),
    timezone: env.TIMEZONE ?? "Europe/Berlin",
    reasonTtlSeconds: env.REASON_TTL_SECONDS ?? 604800,
    storageType: env.STORAGE_TYPE,
    webhookPath: "/api/bot" as const,
    webhookSecretToken: env.WEBHOOK_SECRET_TOKEN,
    webhookUrl: env.PUBLIC_BASE_URL,
    db,
  };
}

export type BotConfig = ReturnType<typeof createConfigFromEnv>;
