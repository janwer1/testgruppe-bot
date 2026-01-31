import { expect, mock, test } from "bun:test";
import { mockConfig } from "../../shared/utils/test-fixtures";
import { isAdminInBothChats } from "./authz";

test("isAdminInBothChats should return true if user is admin in both chats", async () => {
  const mockBot = {
    api: {
      // biome-ignore lint/suspicious/noExplicitAny: mock argument mismatch
      getChatMember: mock((_chatId: any) => {
        return Promise.resolve({ status: "administrator" });
      }),
    },
    // biome-ignore lint/suspicious/noExplicitAny: mock bot cast
  } as any;

  const result = await isAdminInBothChats(mockBot, 123, mockConfig);
  expect(result).toBe(true);
  expect(mockBot.api.getChatMember).toHaveBeenCalledTimes(2);
});

test("isAdminInBothChats should return false if user is not admin in target chat", async () => {
  const mockBot = {
    api: {
      // biome-ignore lint/suspicious/noExplicitAny: mock argument mismatch
      getChatMember: mock((chatId: any) => {
        if (chatId === mockConfig.targetChatId) {
          return Promise.resolve({ status: "member" });
        }
        return Promise.resolve({ status: "administrator" });
      }),
    },
    // biome-ignore lint/suspicious/noExplicitAny: mock bot cast
  } as any;

  const result = await isAdminInBothChats(mockBot, 123, mockConfig);
  expect(result).toBe(false);
});

test("isAdminInBothChats should return false if API call fails", async () => {
  const mockBot = {
    api: {
      getChatMember: mock(() => Promise.reject(new Error("API Error"))),
    },
    // biome-ignore lint/suspicious/noExplicitAny: mock bot cast
  } as any;

  const consoleSpy = mock(() => {});
  const originalError = console.error;
  console.error = consoleSpy;

  const result = await isAdminInBothChats(mockBot, 123, mockConfig);
  expect(result).toBe(false);

  console.error = originalError;
});
