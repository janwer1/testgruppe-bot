import { z } from "zod";
import { getMessage } from "../templates/messages";
import { env } from "../env";

function countWords(str: string): number {
  return str.trim().split(/\s+/).length;
}
const baseTextSchema = z.string()
  .trim()
  .transform((val) => {
    return val
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  });

function getReasonSchema() {
  const maxChars = env.MAX_REASON_CHARS;
  const minWords = env.MIN_REASON_WORDS;

  return baseTextSchema
    .pipe(z.string()
      .min(1, getMessage("invalid-input"))
      .max(maxChars, getMessage("reason-too-long", { maxChars }))
      .refine((val) => countWords(val) >= minWords, {
        message: getMessage("reason-too-short", { minWords }),
      })
    );
}

function getAdditionalMessageSchema() {
  const maxChars = env.MAX_REASON_CHARS;

  return baseTextSchema
    .pipe(z.string()
      .min(1, getMessage("message-empty"))
      .max(maxChars, getMessage("message-too-long", { maxChars }))
    );
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
