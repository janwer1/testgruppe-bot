import { z } from "zod";
import type { BotConfig } from "../config";
import { getMessage } from "../templates/messages";

function countWords(str: string): number {
  return str.trim().split(/\s+/).length;
}

// Base schema for any text message input - handles trimming and normalization
const baseTextSchema = z
  .string()
  .trim()
  .transform((val) => {
    return val
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  });

function getReasonSchema(config: BotConfig) {
  const maxChars = config.maxReasonChars;
  const minWords = config.minReasonWords;

  return baseTextSchema.pipe(
    z
      .string()
      .min(1, getMessage("invalid-input"))
      .max(maxChars, getMessage("reason-too-long", { maxChars }))
      .refine((val) => countWords(val) >= minWords, {
        message: getMessage("reason-too-short", { minWords }),
      }),
  );
}

function getAdditionalMessageSchema(config: BotConfig) {
  const maxChars = config.maxReasonChars;

  return baseTextSchema.pipe(
    z.string().min(1, getMessage("message-empty")).max(maxChars, getMessage("message-too-long", { maxChars })),
  );
}

export type ValidationResult = { success: true; data: string } | { success: false; error: string };

export function validateReason(input: string, config: BotConfig): ValidationResult {
  const result = getReasonSchema(config).safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const firstError = result.error.issues[0];
    return {
      success: false,
      error: firstError?.message || getMessage("invalid-input"),
    };
  }
}

export function validateAdditionalMessage(input: string, config: BotConfig): ValidationResult {
  const result = getAdditionalMessageSchema(config).safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const firstError = result.error.issues[0];
    return {
      success: false,
      error: firstError?.message || getMessage("invalid-input"),
    };
  }
}
