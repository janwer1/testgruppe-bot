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
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "PUBLIC_BASE_URL must be a valid URL" }
    ),
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
    .refine(
      (val: string) => {
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "UPSTASH_REDIS_REST_URL must be a valid URL" }
    ),
  UPSTASH_REDIS_REST_TOKEN: z.string(),
  JOIN_LINK: z
    .string()
    .refine(
      (val: string) => {
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "JOIN_LINK must be a valid URL" }
    ),
};

type Env = z.infer<z.ZodObject<typeof envSchema>>;

let _env: Env | undefined;

export function initEnv(runtimeEnv: Record<string, string | undefined> = process.env) {
  _env = createEnv({
    server: envSchema,
    runtimeEnv,
    skipValidation: false,
    emptyStringAsUndefined: true,
  });
}

export const env = new Proxy({} as Env, {
  get(_, prop: string | symbol) {
    if (!_env) {
      initEnv();
    }
    return _env![prop as keyof Env];
  },
});
