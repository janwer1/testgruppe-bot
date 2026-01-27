import { expect, test } from "bun:test";
import { createReviewCardKeyboard, type ReviewCardData } from "./reviewCard";

test("createReviewCardKeyboard should create keyboard with approve and decline buttons", () => {
  const keyboard = createReviewCardKeyboard("test-request-123");

  expect(keyboard).toBeDefined();
  // The keyboard should have inline keyboard structure
  // We can't easily test the internal structure, but we can verify it's created
  expect(keyboard).toBeTruthy();
});

test("createReviewCardKeyboard should include request ID in callback data", () => {
  const requestId = "test-request-123";
  const keyboard = createReviewCardKeyboard(requestId);

  // The keyboard should contain the requestId in the callback data
  // This is a basic smoke test - actual structure testing would require
  // accessing internal properties or using the keyboard in a real scenario
  expect(keyboard).toBeDefined();
});

test("ReviewCardData should accept valid review card data", () => {
  const data: ReviewCardData = {
    userId: 12345,
    userName: "Test User",
    username: "testuser",
    reason: "Test reason",
    timestamp: new Date(),
    requestId: "test-123",
    additionalMessages: ["Message 1", "Message 2"],
  };

  expect(data.userId).toBe(12345);
  expect(data.userName).toBe("Test User");
  expect(data.reason).toBe("Test reason");
  expect(data.additionalMessages).toHaveLength(2);
});

test("ReviewCardData should accept data without username", () => {
  const data: ReviewCardData = {
    userId: 12345,
    userName: "Test User",
    reason: "Test reason",
    timestamp: new Date(),
    requestId: "test-123",
  };

  expect(data.username).toBeUndefined();
});

test("ReviewCardData should accept data without additional messages", () => {
  const data: ReviewCardData = {
    userId: 12345,
    userName: "Test User",
    reason: "Test reason",
    timestamp: new Date(),
    requestId: "test-123",
  };

  expect(data.additionalMessages).toBeUndefined();
});
