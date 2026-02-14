import type { Api } from "grammy";
import type { BotConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import { renderReviewCard } from "../views/reviewCardView";

// biome-ignore lint/suspicious/noExplicitAny: consistent with authz.ts
function resolveApi(api: Api | { api: Api } | any): Api {
  if (api && typeof api.sendMessage === "function") {
    return api as Api;
  }
  if (api?.api && typeof api.api.sendMessage === "function") {
    return api.api as Api;
  }
  throw new TypeError("Invalid API instance");
}

export interface ReviewCardData {
  userId: number;
  displayName: string;
  username?: string;
  reason: string;
  timestamp: Date;
  requestId: string;
  additionalMessages?: string[]; // Additional messages from user
}

/**
 * Helper to retry API calls with chat migration handling
 */
async function withAdminChatIdRetry<T>(
  // biome-ignore lint/suspicious/noExplicitAny: consistent with authz.ts
  api: Api | { api: Api } | any,
  fn: (chatId: number) => Promise<T>,
  config: BotConfig,
): Promise<T | undefined> {
  const _apiInstance = resolveApi(api);
  const chatId = config.adminReviewChatId;

  try {
    return await fn(chatId);
  } catch (error: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: any is needed for Telegram error properties
    const err = error as any;
    // Handle chat migration (group upgraded to supergroup)
    if (err?.error_code === 400 && err?.parameters?.migrate_to_chat_id) {
      const newChatId = err.parameters.migrate_to_chat_id;
      logger.warn(
        { oldChatId: chatId, newChatId },
        "Chat was upgraded to supergroup. Update ADMIN_REVIEW_CHAT_ID in your .env file.",
      );

      // Retry with new chat ID
      try {
        return await fn(newChatId);
      } catch (retryError) {
        logger.error({ err: retryError, newChatId }, "Error after chat migration");
        return undefined;
      }
    }
    throw error;
  }
}

export async function postReviewCard(
  // biome-ignore lint/suspicious/noExplicitAny: consistent with authz.ts
  api: Api | { api: Api } | any,
  data: ReviewCardData,
  config: BotConfig,
): Promise<number | undefined> {
  try {
    const view = renderReviewCard({ ...data, status: "pending" }, config.timezone);

    const result = await withAdminChatIdRetry(
      api,
      async (chatId) => {
        const apiInstance = resolveApi(api);
        const sentMessage = await apiInstance.sendMessage(chatId, view.text, {
          reply_markup: view.keyboard,
        });
        return sentMessage.message_id;
      },
      config,
    );

    return result;
  } catch (error) {
    logger.error({ err: error, userId: data.userId }, "Error posting review card");
    return undefined;
  }
}

export async function appendMessageToReviewCard(
  // biome-ignore lint/suspicious/noExplicitAny: consistent with authz.ts
  api: Api | { api: Api } | any,
  messageId: number,
  updatedReviewCardData: ReviewCardData,
  config: BotConfig,
): Promise<void> {
  try {
    const view = renderReviewCard({ ...updatedReviewCardData, status: "pending" }, config.timezone);

    await withAdminChatIdRetry(
      api,
      async (chatId) => {
        const apiInstance = resolveApi(api);
        await apiInstance.editMessageText(chatId, messageId, view.text, {
          reply_markup: view.keyboard,
        });
      },
      config,
    );
  } catch (error) {
    logger.error(
      { err: error, messageId, userId: updatedReviewCardData.userId },
      "Error appending message to review card",
    );
  }
}

export async function updateReviewCard(
  // biome-ignore lint/suspicious/noExplicitAny: consistent with authz.ts
  api: Api | { api: Api } | any,
  messageId: number,
  status: "approved" | "declined",
  adminName: string,
  originalData: ReviewCardData,
  config: BotConfig,
): Promise<void> {
  try {
    const view = renderReviewCard(
      {
        ...originalData,
        status,
        adminName,
      },
      config.timezone,
    );

    await withAdminChatIdRetry(
      api,
      async (chatId) => {
        const apiInstance = resolveApi(api);
        await apiInstance.editMessageText(chatId, messageId, view.text);
      },
      config,
    );
  } catch (error) {
    logger.error({ err: error, messageId, status }, "Error updating review card");
  }
}
