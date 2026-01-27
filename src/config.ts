import type { Env } from "./env";

export function createConfigFromEnv(env: Env) {
  return {
    adminReviewChatId: env.ADMIN_REVIEW_CHAT_ID,
    botToken: env.BOT_TOKEN,
    joinLink: env.JOIN_LINK,
    maxReasonChars: env.MAX_REASON_CHARS,
    minReasonWords: env.MIN_REASON_WORDS,
    targetChatId: env.TARGET_CHAT_ID,
    timezone: env.TIMEZONE,
    upstashRedisRestToken: env.UPSTASH_REDIS_REST_TOKEN,
    upstashRedisRestUrl: env.UPSTASH_REDIS_REST_URL,
    webhookPath: "/api/bot" as const,
    webhookSecretToken: env.WEBHOOK_SECRET_TOKEN,
    webhookUrl: env.PUBLIC_BASE_URL,
  };
}

export type BotConfig = ReturnType<typeof createConfigFromEnv>;
