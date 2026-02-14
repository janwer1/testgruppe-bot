import { beforeEach, describe, expect, jest, test } from "bun:test";
import { JoinRequest } from "../../domain/JoinRequest";
import type { JoinRequestInput } from "../../domain/joinRequestMachine";
import { mockConfig } from "../../shared/utils/test-fixtures";
import { getMessage } from "../../templates/messages";
import { JoinRequestService } from "./joinRequestService";

describe("JoinRequestService", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  let mockRepo: any;
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  let mockBot: any;
  let service: JoinRequestService;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(async (input: JoinRequestInput) => new JoinRequest(input)),
      save: jest.fn(async () => {}),
      findById: jest.fn(async () => undefined),
      findByUserId: jest.fn(async () => undefined),
      findRecent: jest.fn(async () => []),
      findRecentByStatus: jest.fn(async () => []),
      markPendingAsStaleResolved: jest.fn(async () => 0),
    };

    mockBot = {
      api: {
        sendMessage: jest.fn(async () => ({ message_id: 123 })),
        approveChatJoinRequest: jest.fn(async () => {}),
        declineChatJoinRequest: jest.fn(async () => {}),
        editMessageText: jest.fn(async () => {}),
        getChatMember: jest.fn(async () => ({ status: "administrator" })),
      },
    };

    service = new JoinRequestService(mockRepo, mockConfig, mockBot);
  });

  test("initializeRequest should create request and send welcome message", async () => {
    const user = { id: 123, first_name: "Test", last_name: "User", username: "testuser" };
    const targetChatId = -1001;

    await service.initializeRequest(user, targetChatId);

    expect(mockRepo.create).toHaveBeenCalled();
    expect(mockRepo.save).toHaveBeenCalled();
    expect(mockBot.api.sendMessage).toHaveBeenCalledWith(123, expect.stringContaining("Begründung"));
  });

  test("handleUserMessage should process collectingReason state", async () => {
    const userId = 123;
    const text = "This is a valid reason with enough words.";
    const request = new JoinRequest({
      requestId: "req-1",
      userId,
      targetChatId: mockConfig.targetChatId,
      displayName: "Test User",
      timestamp: Date.now(),
      config: mockConfig,
    });
    request.startCollection();

    mockRepo.findByUserId.mockImplementation(async () => request);

    const result = await service.handleUserMessage(userId, text);

    expect(request.getState()).toBe("awaitingReview");
    expect(mockRepo.save).toHaveBeenCalled();
    expect(result.reply).toBe(getMessage("thank-you"));
  });

  test("handleAdminAction should approve request", async () => {
    const requestId = "req-1";
    const adminId = 999;
    const adminName = "Admin";
    const userId = 123;

    const request = new JoinRequest({
      requestId,
      userId,
      targetChatId: mockConfig.targetChatId,
      displayName: "Test User",
      timestamp: Date.now(),
      config: mockConfig,
    });
    request.startCollection();
    request.submitReason("Valid reason here");
    request.setAdminMsgId(456);

    mockRepo.findById.mockImplementation(async () => request);

    const result = await service.handleAdminAction(requestId, adminId, adminName, "approve");

    expect(result.ok).toBe(true);
    expect(request.getState()).toBe("approved");
    expect(mockBot.api.approveChatJoinRequest).toHaveBeenCalled();
    expect(mockBot.api.sendMessage).toHaveBeenCalledWith(userId, getMessage("approved-user"));
  });

  test("handleAdminAction should reject unauthorized admins", async () => {
    const requestId = "req-1";
    const adminId = 666;

    const request = new JoinRequest({
      requestId,
      userId: 123,
      targetChatId: mockConfig.targetChatId,
      displayName: "Test User",
      timestamp: Date.now(),
      config: mockConfig,
    });
    request.startCollection();
    request.submitReason("Valid reason here");

    mockRepo.findById.mockImplementation(async () => request);
    mockBot.api.getChatMember.mockImplementation(async () => ({ status: "member" }));

    const result = await service.handleAdminAction(requestId, adminId, "BadAdmin", "approve");

    expect(result.ok).toBe(false);
    expect(result.message).toBe(getMessage("not-authorized"));
    expect(request.getState()).toBe("awaitingReview");
  });
});
