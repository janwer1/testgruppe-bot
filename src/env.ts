import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const envSchema = {
  MODE: z.enum(["dev", "prod"]).default("prod"),
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  TARGET_CHAT_ID: z
    .string()
    .refine((val: string) => !val.includes("_"), {
      message: "TARGET_CHAT_ID must not contain underscores",
    })
    .transform((val: string) => {
      const num = parseInt(val, 10);
      if (isNaN(num)) {
        throw new Error("TARGET_CHAT_ID must be a valid number");
      }
      return num;
    }),
  ADMIN_REVIEW_CHAT_ID: z
    .string()
    .refine((val: string) => !val.includes("_"), {
      message: "ADMIN_REVIEW_CHAT_ID must not contain underscores",
    })
    .transform((val: string) => {
      const num = parseInt(val, 10);
      if (isNaN(num)) {
        throw new Error("ADMIN_REVIEW_CHAT_ID must be a valid number");
      }
      return num;
    }),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PUBLIC_BASE_URL: z
    .string()
    .refine((val: string) => {
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }, "PUBLIC_BASE_URL must be a valid URL")
    .optional(),
  WEBHOOK_PATH: z.string().default("/api/bot"),
  WEBHOOK_SECRET_TOKEN: z.string().optional(),
  REASON_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  MAX_REASON_CHARS: z.coerce.number().int().positive().default(500),
  MIN_REASON_WORDS: z.coerce.number().int().positive().default(10),
  TIMEZONE: z.string().default("Europe/Berlin"),
  DROP_PENDING_UPDATES_ON_DEV_START: z
    .string()
    .transform((val: string) => val === "true")
    .pipe(z.boolean())
    .default(false),
  UPSTASH_REDIS_REST_URL: z
    .string()
    .refine((val: string) => {
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }, "UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string(),
  JOIN_LINK: z
    .string()
    .refine((val: string) => {
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }, "JOIN_LINK must be a valid URL"),
};

// Default values to use when validation is skipped or fails during startup check
const defaultValues: Record<string, any> = {
  MODE: "prod",
  BOT_TOKEN: "dummy_token",
  TARGET_CHAT_ID: 0,
  ADMIN_REVIEW_CHAT_ID: 0,
  LOG_LEVEL: "info",
  WEBHOOK_PATH: "/api/bot",
  REASON_TTL_SECONDS: 604800,
  MAX_REASON_CHARS: 500,
  MIN_REASON_WORDS: 10,
  TIMEZONE: "Europe/Berlin",
  DROP_PENDING_UPDATES_ON_DEV_START: false,
  UPSTASH_REDIS_REST_URL: "https://example.com",
  UPSTASH_REDIS_REST_TOKEN: "dummy_token",
  JOIN_LINK: "https://example.com",
};

let internalEnv: any = null;
let isDummy = false;

export function initEnv(runtimeEnv: any = process.env) {
  try {
    internalEnv = createEnv({
      server: envSchema,
      runtimeEnv,
      skipValidation: false,
    });
    isDummy = false;
  } catch (error) {
    const isEssentialMissing = !runtimeEnv.BOT_TOKEN || !runtimeEnv.UPSTASH_REDIS_REST_TOKEN;
    if (isEssentialMissing) {
      internalEnv = null;
      isDummy = true;
      return;
    }
    throw error;
  }
}

export const env = new Proxy({} as any, {
  get(_, prop: string) {
    if (!internalEnv || isDummy) {
      initEnv();
    }

    if (isDummy) {
      return defaultValues[prop];
    }

    return internalEnv[prop];
  },
});
