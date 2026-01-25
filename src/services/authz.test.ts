import { test, expect, mock } from "bun:test";
import { isAdminInBothChats } from "./authz";
import { env } from "../env";

test("isAdminInBothChats should return true if user is admin in both chats", async () => {
    const mockBot = {
        api: {
            getChatMember: mock((chatId: any) => {
                return Promise.resolve({ status: "administrator" });
            })
        }
    } as any;

    const result = await isAdminInBothChats(mockBot, 123);
    expect(result).toBe(true);
    expect(mockBot.api.getChatMember).toHaveBeenCalledTimes(2);
});

test("isAdminInBothChats should return false if user is not admin in target chat", async () => {
    const mockBot = {
        api: {
            getChatMember: mock((chatId: any) => {
                if (chatId === env.TARGET_CHAT_ID) {
                    return Promise.resolve({ status: "member" });
                }
                return Promise.resolve({ status: "administrator" });
            })
        }
    } as any;

    const result = await isAdminInBothChats(mockBot, 123);
    expect(result).toBe(false);
});

test("isAdminInBothChats should return false if API call fails", async () => {
    const mockBot = {
        api: {
            getChatMember: mock(() => Promise.reject(new Error("API Error")))
        }
    } as any;

    const result = await isAdminInBothChats(mockBot, 123);
    expect(result).toBe(false);
});
