import { z } from "zod";
import { getMessage } from "../templates/messages";
import { env } from "../env";

function countWords(str: string): number {
  return str.trim().split(/\s+/).length;
}

function getReasonSchema() {
  return z.string()
    .trim()
    .min(1, getMessage("invalid-input"))
    .max(env.MAX_REASON_CHARS || 500, getMessage("reason-too-long", { maxChars: env.MAX_REASON_CHARS || 500 }))
    .transform((val) => {
      return val
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
    })
    .refine((val) => countWords(val) >= (env.MIN_REASON_WORDS || 15), {
      message: getMessage("reason-too-short", { minWords: env.MIN_REASON_WORDS || 15 }),
    });
}

function getAdditionalMessageSchema() {
  return z.string()
    .trim()
    .min(1, getMessage("message-empty"))
    .max(500, getMessage("message-too-long"))
    .transform((val) => {
      return val
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
    });
}

export function validateReason(input: string): { success: boolean; data?: string; error?: string } {
  const result = getReasonSchema().safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const firstError = result.error.issues[0];
    return { success: false, error: firstError?.message || getMessage("invalid-input") };
  }
}

export function validateAdditionalMessage(input: string): { success: boolean; data?: string; error?: string } {
  const result = getAdditionalMessageSchema().safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const firstError = result.error.issues[0];
    return { success: false, error: firstError?.message || getMessage("invalid-input") };
  }
}
