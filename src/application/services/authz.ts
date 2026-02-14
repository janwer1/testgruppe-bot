import type { Api } from "grammy";
import type { BotConfig } from "../../shared/config";
import { logger } from "../../shared/logger";

// biome-ignore lint/suspicious/noExplicitAny: context-agnostic bot
function resolveApi(api: Api | { api: Api } | any): Api {
  if (api && typeof api.getChatMember === "function") {
    return api as Api;
  }
  if (api?.api && typeof api.api.getChatMember === "function") {
    return api.api as Api;
  }
  throw new TypeError("Invalid API instance");
}

export async function isAdminInChat(
  // biome-ignore lint/suspicious/noExplicitAny: context-agnostic bot
  api: Api | { api: Api } | any,
  chatId: number,
  userId: number,
): Promise<boolean> {
  const apiInstance = resolveApi(api);
  const member = await apiInstance.getChatMember(chatId, userId);
  return member.status === "creator" || member.status === "administrator";
}

export async function isAdminInBothChats(
  // biome-ignore lint/suspicious/noExplicitAny: context-agnostic bot
  api: Api | { api: Api } | any,
  userId: number,
  config: BotConfig,
): Promise<boolean> {
  try {
    const [isTargetAdmin, isReviewAdmin] = await Promise.all([
      isAdminInChat(api, config.targetChatId, userId),
      isAdminInChat(api, config.adminReviewChatId, userId),
    ]);

    return isTargetAdmin && isReviewAdmin;
  } catch (error) {
    try {
      // Lazy-load logger or check if it's available to avoid TDZ in tests
      if (typeof logger !== "undefined" && logger) {
        logger.error({ err: error, userId }, "Error checking admin status");
      } else {
        console.error("Error checking admin status (logger not initialized):", error, { userId });
      }
    } catch {
      console.error("Error checking admin status (logger error):", error, { userId });
    }
    return false;
  }
}

export async function canUseAdminCommands(
  // biome-ignore lint/suspicious/noExplicitAny: context-agnostic bot
  api: Api | { api: Api } | any,
  chat: { id: number; type: string },
  user: { id: number },
  config: BotConfig,
): Promise<boolean> {
  if (chat.id === config.adminReviewChatId) {
    return true;
  }

  if (chat.type === "private") {
    try {
      return await isAdminInChat(api, config.adminReviewChatId, user.id);
    } catch (error) {
      logger.error({ err: error, userId: user.id }, "[Admin] Failed to verify admin status");
    }
  }

  return false;
}
