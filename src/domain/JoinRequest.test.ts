import { expect, test } from "bun:test";
import { createTestRequestInput } from "../utils/test-fixtures";
import { JoinRequest } from "./JoinRequest";

test("JoinRequest should create a new request in pending state", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  expect(request.getState()).toBe("pending");
  expect(request.isProcessed()).toBe(false);
});

test("JoinRequest should transition to collectingReason when startCollection is called", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();
  expect(request.getState()).toBe("collectingReason");
});

test("JoinRequest should submit reason and transition to awaitingReview", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();

  const result = request.submitReason("I want to join because I'm interested in the community");
  expect(result.success).toBe(true);
  expect(request.getState()).toBe("awaitingReview");

  const context = request.getContext();
  expect(context.reason).toBe("I want to join because I'm interested in the community");
});

test("JoinRequest should reject invalid reason (too long)", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();

  const longReason = "a".repeat(501); // Assuming MAX_REASON_CHARS is 500
  const result = request.submitReason(longReason);
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
});

test("JoinRequest should reject invalid reason (empty)", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();

  const result = request.submitReason("   ");
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
});

test("JoinRequest should add additional messages", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();
  request.submitReason("Initial reason for test");

  const result = request.addMessage("Additional information");
  expect(result.success).toBe(true);

  const context = request.getContext();
  expect(context.additionalMessages).toContain("Additional information");
});

test("JoinRequest should set admin message ID", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();
  request.submitReason("Test reason for request");

  const result = request.setAdminMsgId(999);
  expect(result.success).toBe(true);

  const context = request.getContext();
  expect(context.adminMsgId).toBe(999);
});

test("JoinRequest should approve request", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();
  request.submitReason("Test reason for approval");

  const result = request.approve(123, "Admin Name");
  expect(result.success).toBe(true);
  expect(request.getState()).toBe("approved");
  expect(request.isProcessed()).toBe(true);

  const context = request.getContext();
  expect(context.decision?.status).toBe("approved");
  expect(context.decision?.adminId).toBe(123);
  expect(context.decision?.adminName).toBe("Admin Name");
});

test("JoinRequest should decline request", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();
  request.submitReason("Test reason for decline");

  const result = request.decline(456, "Admin Name");
  expect(result.success).toBe(true);
  expect(request.getState()).toBe("declined");
  expect(request.isProcessed()).toBe(true);

  const context = request.getContext();
  expect(context.decision?.status).toBe("declined");
  expect(context.decision?.adminId).toBe(456);
  expect(context.decision?.adminName).toBe("Admin Name");
});

test("JoinRequest should not allow approving without reason", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();

  const result = request.approve(123, "Admin Name");
  expect(result.success).toBe(false);
  expect(result.error).toContain("not awaiting review");
});

test("JoinRequest should not allow approving twice", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();
  request.submitReason("Test reason double approve");
  request.approve(123, "Admin Name");

  // Request is now in "approved" state (final state)
  const result = request.approve(456, "Another Admin");
  expect(result.success).toBe(false);
  // Error message depends on state - in "approved" state, it's "not awaiting review"
  expect(result.error).toBeDefined();
  expect(result.error).toMatch(/not awaiting review|already been processed/);
});

test("JoinRequest should restore from context correctly", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();
  request.submitReason("Test reason for restore");
  request.setAdminMsgId(999);
  request.addMessage("Message 1");
  request.addMessage("Message 2");

  const context = request.getContext();
  const restored = JoinRequest.fromContext(context);

  expect(restored.getState()).toBe("awaitingReview");
  expect(restored.getContext().reason).toBe("Test reason for restore");
  expect(restored.getContext().adminMsgId).toBe(999);
  expect(restored.getContext().additionalMessages).toEqual(["Message 1", "Message 2"]);
});

test("JoinRequest should restore approved request from context", () => {
  const input = createTestRequestInput();
  const request = new JoinRequest(input);
  request.startCollection();
  request.submitReason("Test reason restore approved");
  request.approve(123, "Admin Name");

  const context = request.getContext();
  const restored = JoinRequest.fromContext(context);

  expect(restored.getState()).toBe("approved");
  expect(restored.isProcessed()).toBe(true);
  expect(restored.getContext().decision?.status).toBe("approved");
});
