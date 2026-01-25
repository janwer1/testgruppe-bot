import { z } from "zod";
import { getMessage } from "../templates/messages";
import { env } from "../env";

// Helper to count words
function countWords(str: string): number {
  return str.trim().split(/\s+/).length;
}

// Schema for user reason input
export const reasonSchema = z.string()
  .trim()
  .min(1, getMessage("invalid-input"))
  .max(env.MAX_REASON_CHARS, getMessage("reason-too-long", { maxChars: env.MAX_REASON_CHARS }))
  .transform((val) => {
    // Additional normalization
    return val
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  })
  .refine((val) => countWords(val) >= env.MIN_REASON_WORDS, {
    message: getMessage("reason-too-short", { minWords: env.MIN_REASON_WORDS }),
  });

// Schema for additional messages
export const additionalMessageSchema = z.string()
  .trim()
  .min(1, getMessage("message-empty"))
  .max(500, getMessage("message-too-long"))
  .transform((val) => {
    return val
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  });

// Validate and sanitize reason
export function validateReason(input: string): { success: boolean; data?: string; error?: string } {
  const result = reasonSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const firstError = result.error.issues[0];
    return { success: false, error: firstError?.message || getMessage("invalid-input") };
  }
}

// Validate additional message
export function validateAdditionalMessage(input: string): { success: boolean; data?: string; error?: string } {
  const result = additionalMessageSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const firstError = result.error.issues[0];
    return { success: false, error: firstError?.message || getMessage("invalid-input") };
  }
}
