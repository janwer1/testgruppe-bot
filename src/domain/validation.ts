import { type ArkErrors, type } from "arktype";
import type { BotConfig } from "../shared/config";
import { getMessage } from "../templates/messages";

function countWords(str: string): number {
  return str.trim().split(/\s+/).length;
}

// Base text processing - handles trimming and normalization
function processBaseText(val: string): string {
  return val
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

const baseTextSchema = type("string").pipe(processBaseText);

function isArkErrors(val: unknown): val is ArkErrors {
  return val !== null && typeof val === "object" && "errors" in val;
}

export type ValidationResult = { success: true; data: string } | { success: false; error: string };

export function validateReason(input: string, config: BotConfig): ValidationResult {
  const result = baseTextSchema(input);

  if (isArkErrors(result)) {
    return { success: false, error: getMessage("invalid-input") };
  }

  const processed = result as string;

  if (processed.length === 0) {
    return { success: false, error: getMessage("invalid-input") };
  }

  if (processed.length > config.maxReasonChars) {
    return {
      success: false,
      error: getMessage("reason-too-long", { maxChars: config.maxReasonChars }),
    };
  }

  if (countWords(processed) < config.minReasonWords) {
    return {
      success: false,
      error: getMessage("reason-too-short", { minWords: config.minReasonWords }),
    };
  }

  return { success: true, data: processed };
}

export function validateAdditionalMessage(input: string, config: BotConfig): ValidationResult {
  const result = baseTextSchema(input);

  if (isArkErrors(result)) {
    return { success: false, error: getMessage("invalid-input") };
  }

  const processed = result as string;

  if (processed.length === 0) {
    return { success: false, error: getMessage("message-empty") };
  }

  if (processed.length > config.maxReasonChars) {
    return {
      success: false,
      error: getMessage("message-too-long", { maxChars: config.maxReasonChars }),
    };
  }

  return { success: true, data: processed };
}
