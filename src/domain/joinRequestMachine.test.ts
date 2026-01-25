import { test, expect } from "bun:test";
import { createActor } from "xstate";
import { joinRequestMachine } from "./joinRequestMachine";
import type { JoinRequestInput } from "./joinRequestMachine";

const createTestInput = (): JoinRequestInput => ({
    requestId: "test-123",
    userId: 12345,
    targetChatId: -1001234567890,
    userName: "Test User",
    username: "testuser",
    timestamp: Date.now(),
  });

test("joinRequestMachine should start in pending state", () => {
    const actor = createActor(joinRequestMachine, {
      input: createTestInput(),
    });
    actor.start();

    expect(actor.getSnapshot().value).toBe("pending");
  });

test("joinRequestMachine should transition to collectingReason on START_COLLECTION", () => {
    const actor = createActor(joinRequestMachine, {
      input: createTestInput(),
    });
    actor.start();

    actor.send({ type: "START_COLLECTION" });
    expect(actor.getSnapshot().value).toBe("collectingReason");
  });

test("joinRequestMachine should transition to awaitingReview on SUBMIT_REASON", () => {
    const actor = createActor(joinRequestMachine, {
      input: createTestInput(),
    });
    actor.start();

    actor.send({ type: "START_COLLECTION" });
    actor.send({ type: "SUBMIT_REASON", reason: "Test reason here" });

    expect(actor.getSnapshot().value).toBe("awaitingReview");
    expect(actor.getSnapshot().context.reason).toBe("Test reason here");
  });

test("joinRequestMachine should reject invalid reason (too long)", () => {
    const actor = createActor(joinRequestMachine, {
      input: createTestInput(),
    });
    actor.start();

    actor.send({ type: "START_COLLECTION" });
    const longReason = "a".repeat(501);
    actor.send({ type: "SUBMIT_REASON", reason: longReason });

    // Should still be in collectingReason state
    expect(actor.getSnapshot().value).toBe("collectingReason");
    expect(actor.getSnapshot().context.reason).toBeUndefined();
  });

test("joinRequestMachine should add messages in awaitingReview state", () => {
    const actor = createActor(joinRequestMachine, {
      input: createTestInput(),
    });
    actor.start();

    actor.send({ type: "START_COLLECTION" });
    actor.send({ type: "SUBMIT_REASON", reason: "Test reason messages" });
    actor.send({ type: "ADD_MESSAGE", message: "Message 1" });
    actor.send({ type: "ADD_MESSAGE", message: "Message 2" });

    const context = actor.getSnapshot().context;
    expect(context.additionalMessages).toEqual(["Message 1", "Message 2"]);
  });

  test("joinRequestMachine should set admin message ID", () => {
    const actor = createActor(joinRequestMachine, {
      input: createTestInput(),
    });
    actor.start();

    actor.send({ type: "START_COLLECTION" });
    actor.send({ type: "SUBMIT_REASON", reason: "Test reason admin" });
    actor.send({ type: "SET_ADMIN_MSG_ID", adminMsgId: 999 });

    expect(actor.getSnapshot().context.adminMsgId).toBe(999);
  });

  test("joinRequestMachine should approve request", () => {
    const actor = createActor(joinRequestMachine, {
      input: createTestInput(),
    });
    actor.start();

    actor.send({ type: "START_COLLECTION" });
    actor.send({ type: "SUBMIT_REASON", reason: "Test reason approve" });
    actor.send({ type: "APPROVE", adminId: 123, adminName: "Admin" });

    expect(actor.getSnapshot().value).toBe("approved");
    expect(actor.getSnapshot().context.decision?.status).toBe("approved");
    expect(actor.getSnapshot().context.decision?.adminId).toBe(123);
  });

  test("joinRequestMachine should decline request", () => {
    const actor = createActor(joinRequestMachine, {
      input: createTestInput(),
    });
    actor.start();

    actor.send({ type: "START_COLLECTION" });
    actor.send({ type: "SUBMIT_REASON", reason: "Test reason decline" });
    actor.send({ type: "DECLINE", adminId: 456, adminName: "Admin" });

    expect(actor.getSnapshot().value).toBe("declined");
    expect(actor.getSnapshot().context.decision?.status).toBe("declined");
    expect(actor.getSnapshot().context.decision?.adminId).toBe(456);
  });

test("joinRequestMachine should not allow approve without reason", () => {
    const actor = createActor(joinRequestMachine, {
      input: createTestInput(),
    });
    actor.start();

    actor.send({ type: "START_COLLECTION" });
    actor.send({ type: "APPROVE", adminId: 123, adminName: "Admin" });

    // Should still be in collectingReason (approve was ignored)
    expect(actor.getSnapshot().value).toBe("collectingReason");
    expect(actor.getSnapshot().context.decision).toBeUndefined();
  });

test("joinRequestMachine should not allow approve twice", () => {
    const actor = createActor(joinRequestMachine, {
      input: createTestInput(),
    });
    actor.start();

    actor.send({ type: "START_COLLECTION" });
    actor.send({ type: "SUBMIT_REASON", reason: "Test reason twice" });
    actor.send({ type: "APPROVE", adminId: 123, adminName: "Admin" });

    // Try to approve again (should be ignored since we're in final state)
    const beforeState = actor.getSnapshot().value;
    actor.send({ type: "APPROVE", adminId: 456, adminName: "Another Admin" });

    expect(actor.getSnapshot().value).toBe(beforeState); // Should remain in approved
  });
