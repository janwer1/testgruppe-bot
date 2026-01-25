import { test, expect } from "bun:test";
import { JoinRequestRepository } from "./JoinRequestRepository";
import { JoinRequest } from "../domain/JoinRequest";
import type { JoinRequestInput } from "../domain/joinRequestMachine";

function createTestInput(): JoinRequestInput {
  return {
    requestId: "test-request-" + Date.now() + "-" + Math.random(),
    userId: 12345,
    targetChatId: -1001234567890,
    userName: "Test User",
    username: "testuser",
    timestamp: Date.now(),
  };
}

test("should create a new join request", async () => {
  const repository = new JoinRequestRepository();
  const testInput = createTestInput();
  const request = await repository.create(testInput);

  expect(request).toBeInstanceOf(JoinRequest);
  expect(request.getState()).toBe("pending");
  
  const found = await repository.findByUserId(testInput.userId);
  expect(found).toBeDefined();
  expect(found?.getContext().requestId).toBe(testInput.requestId);
});

test("should find request by ID after saving", async () => {
  const repository = new JoinRequestRepository();
  const testInput = createTestInput();
  const request = await repository.create(testInput);
  request.startCollection();
  request.submitReason("Test reason here");
  await repository.save(request);

  const found = await repository.findById(testInput.requestId);
  expect(found).toBeDefined();
  expect(found?.getContext().requestId).toBe(testInput.requestId);
  expect(found?.getContext().reason).toBe("Test reason here");
});

test("should find request by user ID", async () => {
  const repository = new JoinRequestRepository();
  const testInput = createTestInput();
  await repository.create(testInput);

  const found = await repository.findByUserId(testInput.userId);
  expect(found).toBeDefined();
  expect(found?.getContext().userId).toBe(testInput.userId);
});

test("should save request state correctly", async () => {
  const repository = new JoinRequestRepository();
  const testInput = createTestInput();
  const request = await repository.create(testInput);
  request.startCollection();
  request.submitReason("Test reason save");
  request.setAdminMsgId(999);
  
  await repository.save(request);

  const found = await repository.findById(testInput.requestId);
  expect(found).toBeDefined();
  expect(found?.getContext().reason).toBe("Test reason save");
  expect(found?.getContext().adminMsgId).toBe(999);
});

test("should persist decision information", async () => {
  const repository = new JoinRequestRepository();
  const testInput = createTestInput();
  const request = await repository.create(testInput);
  request.startCollection();
  request.submitReason("Test reason decision");
  request.approve(123, "Admin Name");
  
  await repository.save(request);

  const found = await repository.findById(testInput.requestId);
  expect(found).toBeDefined();
  expect(found?.isProcessed()).toBe(true);
  expect(found?.getContext().decision?.status).toBe("approved");
  expect(found?.getContext().decision?.adminId).toBe(123);
  expect(found?.getContext().decision?.adminName).toBe("Admin Name");
});

test("should return undefined for non-existent request", async () => {
  const repository = new JoinRequestRepository();
  const found = await repository.findById("non-existent-request-id");
  expect(found).toBeUndefined();
});

test("should return undefined for non-existent user", async () => {
  const repository = new JoinRequestRepository();
  const found = await repository.findByUserId(999999);
  expect(found).toBeUndefined();
});