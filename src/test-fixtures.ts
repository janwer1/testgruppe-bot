import type { BotConfig } from "./config";
import type { JoinRequestInput } from "./domain/joinRequestMachine";

export const mockConfig: BotConfig = {
  botToken: "test-token",
  targetChatId: -1001,
  joinLink: "https://t.me/testlink",
  minReasonWords: 2,
  maxReasonChars: 100,
  timezone: "UTC",
  webhookUrl: "https://test.com",
  webhookSecret: "secret",
  adminReviewChatId: -1002,
  upstashRedisRestUrl: "https://redis",
  upstashRedisRestToken: "token",
};

export function createTestRequestInput(overrides: Partial<JoinRequestInput> = {}): JoinRequestInput {
  return {
    requestId: `test-request-${Date.now()}-${Math.random()}`,
    userId: 12345,
    targetChatId: -1001234567890,
    userName: "Test User",
    username: "testuser",
    timestamp: Date.now(),
    config: mockConfig,
    ...overrides,
  };
}
