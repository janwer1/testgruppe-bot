import type { JoinRequestInput } from "../../domain/joinRequestMachine";
import type { BotConfig } from "../config";

export const mockConfig: BotConfig = {
  botToken: "test-token",
  targetChatId: -1001,
  joinLink: "https://t.me/testlink",
  minReasonWords: 2,
  maxReasonChars: 100,
  timezone: "UTC",
  webhookPath: "/api/bot" as const,
  webhookUrl: "https://test.com",
  webhookSecretToken: "secret",
  adminReviewChatId: -1002,
  reasonTtlSeconds: 604800,
  storageType: "memory",
  db: undefined,
};

export function createTestRequestInput(overrides: Partial<JoinRequestInput> = {}): JoinRequestInput {
  return {
    requestId: `test-request-${Date.now()}-${Math.random()}`,
    userId: 12345,
    targetChatId: -1001234567890,
    displayName: "Test User",
    username: "testuser",
    timestamp: Date.now(),
    config: mockConfig,
    ...overrides,
  };
}
