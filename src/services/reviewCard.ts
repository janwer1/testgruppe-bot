import { type Api, Bot, InlineKeyboard } from "grammy";
import type { BotConfig } from "../config";
import { formatReviewCardMessage, formatUpdatedReviewCardMessage } from "../templates/reviewCard";

export interface ReviewCardData {
  userId: number;
  displayName: string;
  username?: string;
  reason: string;
  timestamp: Date;
  requestId: string;
  additionalMessages?: string[]; // Additional messages from user
}

export function createReviewCardKeyboard(requestId: string): InlineKeyboard {
  return new InlineKeyboard().text("✅ Approve", `approve_${requestId}`).text("❌ Decline", `decline_${requestId}`);
}

/**
 * Helper to retry API calls with chat migration handling
 */
async function withAdminChatIdRetry<T>(
  // biome-ignore lint/suspicious/noExplicitAny: context-agnostic bot
  api: Api | Bot<any>,
  fn: (chatId: number) => Promise<T>,
  config: BotConfig,
): Promise<T | undefined> {
  const _apiInstance = api instanceof Bot ? api.api : api;
  const chatId = config.adminReviewChatId;

  try {
    return await fn(chatId);
  } catch (error: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: any is needed for Telegram error properties
    const err = error as any;
    // Handle chat migration (group upgraded to supergroup)
    if (err?.error_code === 400 && err?.parameters?.migrate_to_chat_id) {
      const newChatId = err.parameters.migrate_to_chat_id;
      console.warn(
        `Chat ${chatId} was upgraded to supergroup ${newChatId}. Update ADMIN_REVIEW_CHAT_ID in your .env file.`,
      );

      // Retry with new chat ID
      try {
        return await fn(newChatId);
      } catch (retryError) {
        console.error("Error after chat migration:", retryError);
        return undefined;
      }
    }
    throw error;
  }
}

export async function postReviewCard(
  // biome-ignore lint/suspicious/noExplicitAny: context-agnostic bot
  api: Api | Bot<any>,
  data: ReviewCardData,
  config: BotConfig,
): Promise<number | undefined> {
  try {
    const message = formatReviewCardMessage(data, config.timezone);
    const keyboard = createReviewCardKeyboard(data.requestId);

    const result = await withAdminChatIdRetry(
      api,
      async (chatId) => {
        const apiInstance = api instanceof Bot ? api.api : api;
        const sentMessage = await apiInstance.sendMessage(chatId, message, {
          reply_markup: keyboard,
        });
        return sentMessage.message_id;
      },
      config,
    );

    return result;
  } catch (error) {
    console.error("Error posting review card:", error);
    return undefined;
  }
}

export async function appendMessageToReviewCard(
  // biome-ignore lint/suspicious/noExplicitAny: context-agnostic bot
  api: Api | Bot<any>,
  messageId: number,
  updatedReviewCardData: ReviewCardData,
  config: BotConfig,
): Promise<void> {
  try {
    const message = formatReviewCardMessage(updatedReviewCardData, config.timezone);
    const keyboard = createReviewCardKeyboard(updatedReviewCardData.requestId);

    await withAdminChatIdRetry(
      api,
      async (chatId) => {
        const apiInstance = api instanceof Bot ? api.api : api;
        await apiInstance.editMessageText(chatId, messageId, message, {
          reply_markup: keyboard,
        });
      },
      config,
    );
  } catch (error) {
    console.error("Error appending message to review card:", error);
  }
}

export async function updateReviewCard(
  // biome-ignore lint/suspicious/noExplicitAny: context-agnostic bot
  api: Api | Bot<any>,
  messageId: number,
  status: "approved" | "declined",
  adminName: string,
  originalData: ReviewCardData,
  config: BotConfig,
): Promise<void> {
  try {
    const updatedMessage = formatUpdatedReviewCardMessage(originalData, status, adminName, config.timezone);

    await withAdminChatIdRetry(
      api,
      async (chatId) => {
        const apiInstance = api instanceof Bot ? api.api : api;
        await apiInstance.editMessageText(chatId, messageId, updatedMessage);
      },
      config,
    );
  } catch (error) {
    console.error("Error updating review card:", error);
  }
}
