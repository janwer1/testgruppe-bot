import { expect, test } from "bun:test";
import { JoinRequest } from "../../domain/JoinRequest";
import { createTestRequestInput, mockConfig } from "../../shared/utils/test-fixtures";
import { JoinRequestRepository } from "./JoinRequestRepository";
import { MemoryStateStore } from "./state";

test("should create a new join request", async () => {
  const store = new MemoryStateStore(mockConfig);
  const repository = new JoinRequestRepository(store, mockConfig);
  const testInput = createTestRequestInput();
  const request = await repository.create(testInput);

  expect(request).toBeInstanceOf(JoinRequest);
  expect(request.getState()).toBe("pending");

  const found = await repository.findByUserId(testInput.userId);
  expect(found).toBeDefined();
  expect(found?.getContext().requestId).toBe(testInput.requestId);
});

test("should find request by ID after saving", async () => {
  const store = new MemoryStateStore(mockConfig);
  const repository = new JoinRequestRepository(store, mockConfig);
  const testInput = createTestRequestInput();
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
  const store = new MemoryStateStore(mockConfig);
  const repository = new JoinRequestRepository(store, mockConfig);
  const testInput = createTestRequestInput();
  await repository.create(testInput);

  const found = await repository.findByUserId(testInput.userId);
  expect(found).toBeDefined();
  expect(found?.getContext().userId).toBe(testInput.userId);
});

test("should save request state correctly", async () => {
  const store = new MemoryStateStore(mockConfig);
  const repository = new JoinRequestRepository(store, mockConfig);
  const testInput = createTestRequestInput();
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
  const store = new MemoryStateStore(mockConfig);
  const repository = new JoinRequestRepository(store, mockConfig);
  const testInput = createTestRequestInput();
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
  const store = new MemoryStateStore(mockConfig);
  const repository = new JoinRequestRepository(store, mockConfig);
  const found = await repository.findById("non-existent-request-id");
  expect(found).toBeUndefined();
});

test("should return undefined for non-existent user", async () => {
  const store = new MemoryStateStore(mockConfig);
  const repository = new JoinRequestRepository(store, mockConfig);
  const found = await repository.findByUserId(999999);
  expect(found).toBeUndefined();
});

test("should correctly filter pending vs completed requests (buried request regression)", async () => {
  const store = new MemoryStateStore(mockConfig);
  const repository = new JoinRequestRepository(store, mockConfig);

  // 1. Create 5 COMPLETED requests (older)
  for (let i = 0; i < 5; i++) {
    const input = createTestRequestInput({ requestId: `completed-${i}`, userId: 100 + i });
    const req = await repository.create(input);
    req.startCollection();
    req.submitReason("Valid reason correctly provided here");
    req.approve(1, "Admin");
    await repository.save(req);
  }

  // 2. Create 10 PENDING requests (newer)
  for (let i = 0; i < 10; i++) {
    const input = createTestRequestInput({ requestId: `pending-${i}`, userId: 200 + i });
    await repository.create(input);
  }

  // 3. Try to find the 5 completed requests using findRecent(10)
  // OLD: const recent = await repository.findRecent(10);
  // NEW: explicitly ask for completed

  const completed = await repository.findRecentByStatus({ status: "completed", limit: 10 });
  const pending = await repository.findRecentByStatus({ status: "pending", limit: 10 });

  console.log(`Found ${pending.length} pending and ${completed.length} completed.`);

  // If our fix is correct:
  // pending.length should be 10 (out of 10 created)
  // completed.length should be 5 (out of 5 created, even if older)

  expect(pending.length).toBe(10);
  expect(completed.length).toBe(5);
});
