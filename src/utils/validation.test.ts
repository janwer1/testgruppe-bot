import { test, expect } from "bun:test";
import { validateReason, validateAdditionalMessage } from "./validation";

// validateReason tests
test("validateReason should accept valid reason", () => {
  const result = validateReason("I want to join this community");
  expect(result.success).toBe(true);
  expect(result.data).toBe("I want to join this community");
});

test("validateReason should reject empty reason", () => {
  const result = validateReason("");
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
});

test("validateReason should reject whitespace-only reason", () => {
  // After normalization (trim), whitespace-only becomes empty string
  // which should fail min(1) check
  const result = validateReason("   \n\t  ");
  // The transform trims, so this becomes empty and should fail
  // However, Zod transforms happen after validation, so we need to check the actual behavior
  // If the transform makes it empty, the result should still be success=false
  // because the transformed value would be empty
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
});

test("validateReason should trim reason", () => {
  const result = validateReason("  I want to join  ");
  expect(result.success).toBe(true);
  expect(result.data).toBe("I want to join");
});

test("validateReason should normalize newlines", () => {
  const result = validateReason("Line 1\r\nLine 2\rLine 3\nLine 4");
  expect(result.success).toBe(true);
  expect(result.data).toContain("\n");
  expect(result.data).not.toContain("\r");
});

test("validateReason should limit consecutive newlines", () => {
  const result = validateReason("Line 1\n\n\n\nLine 2");
  expect(result.success).toBe(true);
  // Should have at most 2 consecutive newlines
  expect(result.data).not.toMatch(/\n{3,}/);
});

// validateAdditionalMessage tests
test("validateAdditionalMessage should accept valid message", () => {
  const result = validateAdditionalMessage("Additional information");
  expect(result.success).toBe(true);
  expect(result.data).toBe("Additional information");
});

test("validateAdditionalMessage should reject empty message", () => {
  const result = validateAdditionalMessage("");
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
});

test("validateAdditionalMessage should trim message", () => {
  const result = validateAdditionalMessage("  Message  ");
  expect(result.success).toBe(true);
  expect(result.data).toBe("Message");
});
