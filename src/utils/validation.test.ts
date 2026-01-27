import { expect, test } from "bun:test";
import { mockConfig } from "./test-fixtures";
import { validateAdditionalMessage, validateReason } from "./validation";

test("validateReason should accept valid reason", () => {
  const result = validateReason("I want to join this community", mockConfig);
  if (!result.success) throw new Error("Expected success");
  expect(result.data).toBe("I want to join this community");
});

test("validateReason should reject empty reason", () => {
  const result = validateReason("", mockConfig);
  if (result.success) throw new Error("Expected failure");
  expect(result.error).toBeDefined();
});

test("validateReason should reject whitespace-only reason", () => {
  const result = validateReason("   \n\t  ", mockConfig);
  if (result.success) throw new Error("Expected failure");
  expect(result.error).toBeDefined();
});

test("validateReason should trim reason", () => {
  const result = validateReason("  I want to join  ", mockConfig);
  if (!result.success) throw new Error("Expected success");
  expect(result.data).toBe("I want to join");
});

test("validateReason should normalize newlines", () => {
  const result = validateReason("Line 1\r\nLine 2\rLine 3\nLine 4", mockConfig);
  if (!result.success) throw new Error("Expected success");
  expect(result.data).toContain("\n");
  expect(result.data).not.toContain("\r");
});

test("validateReason should limit consecutive newlines", () => {
  const result = validateReason("Line 1\n\n\n\nLine 2", mockConfig);
  if (!result.success) throw new Error("Expected success");
  // Should have at most 2 consecutive newlines
  expect(result.data).not.toMatch(/\n{3,}/);
});

// validateAdditionalMessage tests
test("validateAdditionalMessage should accept valid message", () => {
  const result = validateAdditionalMessage("Additional information", mockConfig);
  if (!result.success) throw new Error("Expected success");
  expect(result.data).toBe("Additional information");
});

test("validateAdditionalMessage should reject empty message", () => {
  const result = validateAdditionalMessage("", mockConfig);
  if (result.success) throw new Error("Expected failure");
  expect(result.error).toBeDefined();
});

test("validateAdditionalMessage should trim message", () => {
  const result = validateAdditionalMessage("  Message  ", mockConfig);
  if (!result.success) throw new Error("Expected success");
  expect(result.data).toBe("Message");
});
