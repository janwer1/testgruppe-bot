import { z } from "zod";

// Normalize newlines (limit consecutive newlines, trim)
function normalizeNewlines(text: string): string {
  return text
    .replace(/\r\n/g, "\n")  // Normalize Windows line endings
    .replace(/\r/g, "\n")    // Normalize Mac line endings
    .replace(/\n{3,}/g, "\n\n") // Limit to max 2 consecutive newlines
    .trim();
}

// Schema for user reason input
// Note: We check min(1) before transform to catch whitespace-only input
export const reasonSchema = z.string()
  .trim()
  .min(1, "Reason cannot be empty")
  .max(500, "Reason is too long (max 500 characters)")
  .transform((val) => {
    // Additional normalization after trim
    return val
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  });

// Schema for additional messages
export const additionalMessageSchema = z.string()
  .trim()
  .min(1, "Message cannot be empty")
  .max(500, "Message is too long (max 500 characters)")
  .transform((val) => {
    // Additional normalization after trim
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
    return { success: false, error: firstError?.message || "Invalid input" };
  }
}

// Validate additional message
export function validateAdditionalMessage(input: string): { success: boolean; data?: string; error?: string } {
  const result = additionalMessageSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const firstError = result.error.issues[0];
    return { success: false, error: firstError?.message || "Invalid input" };
  }
}
