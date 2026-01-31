import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const envSchema = {
  MODE: z.enum(["dev", "prod"]).default("prod"),
  STORAGE_TYPE: z.enum(["d1", "memory"]).optional(),
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  TARGET_CHAT_ID: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = parseInt(val, 10);
      if (Number.isNaN(num)) {
        throw new Error("TARGET_CHAT_ID must be a valid number");
      }
      return num;
    })
    .refine((val) => !val || val < 0, {
      message: "TARGET_CHAT_ID must be a negative number",
    }),
  ADMIN_REVIEW_CHAT_ID: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = parseInt(val, 10);
      if (Number.isNaN(num)) {
        throw new Error("ADMIN_REVIEW_CHAT_ID must be a valid number");
      }
      return num;
    })
    .refine((val) => !val || val < 0, {
      message: "ADMIN_REVIEW_CHAT_ID must be a negative number",
    }),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  PUBLIC_BASE_URL: z
    .string()
    .min(1, "PUBLIC_BASE_URL is required in production")
    .refine(
      (val) => {
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "PUBLIC_BASE_URL must be a valid URL" },
    ),
  WEBHOOK_SECRET_TOKEN: z.string().optional(),
  REASON_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  MAX_REASON_CHARS: z.coerce.number().int().positive().optional(),
  MIN_REASON_WORDS: z.coerce.number().int().positive().optional(),
  TIMEZONE: z.string().optional(),

  JOIN_LINK: z
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
      { message: "JOIN_LINK must be a valid URL" },
    ),
  LOCAL_TUNNEL_URL: z
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
      { message: "LOCAL_TUNNEL_URL must be a valid URL" },
    ),
};

const envSchemaObj = z.object(envSchema);
export type Env = z.infer<typeof envSchemaObj>;

export function parseEnv(runtimeEnv: Record<string, string | undefined> = process.env): Env {
  return createEnv({
    server: envSchema,
    runtimeEnv,
    emptyStringAsUndefined: true,
  }) as Env;
}
