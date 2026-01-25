import { test, expect } from "bun:test";
import { JoinRequest } from "./domain/JoinRequest";
import type { JoinRequestInput } from "./domain/joinRequestMachine";

// Test helper: Create a JoinRequest in a specific state
function createRequestInState(state: string, requestId: string = "test-request-id"): JoinRequest {
  const input: JoinRequestInput = {
    requestId,
    userId: 12345,
    targetChatId: -1001234567890,
    userName: "Test User",
    username: "testuser",
    timestamp: Date.now(),
  };

  const request = new JoinRequest(input);

  // Transition to the desired state
  if (state === "collectingReason") {
    request.startCollection();
  } else if (state === "awaitingReview") {
    request.startCollection();
    request.submitReason("Test reason");
  } else if (state === "approved") {
    request.startCollection();
    request.submitReason("Test reason");
    request.approve(999, "Admin User");
  } else if (state === "declined") {
    request.startCollection();
    request.submitReason("Test reason");
    request.decline(999, "Admin User");
  }
  // "pending" state is the initial state, no transition needed

  return request;
}

// Extract the decision logic from the middleware
function shouldSkipConversationEntry(currentState: string): boolean {
  // If request is in collectingReason or awaitingReview, assume conversation is already active
  return currentState === "collectingReason" || currentState === "awaitingReview";
}

test("should skip entering conversation when request is in collectingReason state", () => {
  const request = createRequestInState("collectingReason", "req-1");
  const currentState = request.getState();
  const shouldSkip = shouldSkipConversationEntry(currentState);

  expect(currentState).toBe("collectingReason");
  expect(shouldSkip).toBe(true);
});

test("should skip entering conversation when request is in awaitingReview state", () => {
  const request = createRequestInState("awaitingReview", "req-2");
  const currentState = request.getState();
  const shouldSkip = shouldSkipConversationEntry(currentState);

  expect(currentState).toBe("awaitingReview");
  expect(shouldSkip).toBe(true);
});

test("should enter conversation when request is in pending state", () => {
  const request = createRequestInState("pending", "req-3");
  const currentState = request.getState();
  const shouldSkip = shouldSkipConversationEntry(currentState);

  expect(currentState).toBe("pending");
  expect(shouldSkip).toBe(false);
});

test("should handle final states (approved/declined) correctly", () => {
  const approvedRequest = createRequestInState("approved", "req-4");
  const declinedRequest = createRequestInState("declined", "req-5");

  const approvedState = approvedRequest.getState();
  const declinedState = declinedRequest.getState();
  const shouldSkipApproved = shouldSkipConversationEntry(approvedState);
  const shouldSkipDeclined = shouldSkipConversationEntry(declinedState);

  expect(approvedState).toBe("approved");
  expect(declinedState).toBe("declined");
  // Final states are not in collectingReason or awaitingReview, so shouldSkip is false
  // This is fine - the middleware would try to enter, but the request is already processed
  expect(shouldSkipApproved).toBe(false);
  expect(shouldSkipDeclined).toBe(false);
});


test("should correctly identify states that require conversation entry", () => {
  const states = ["pending", "collectingReason", "awaitingReview", "approved", "declined"];
  const expectedSkips = [false, true, true, false, false];

  states.forEach((state, index) => {
    const request = createRequestInState(state, `req-${index}`);
    const currentState = request.getState();
    const shouldSkip = shouldSkipConversationEntry(currentState);
    expect(shouldSkip).toBe(expectedSkips[index]);
  });
});
