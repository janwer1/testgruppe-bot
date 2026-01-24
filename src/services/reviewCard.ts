import { Bot, InlineKeyboard, Api } from "grammy";
import { env } from "../env";
import { formatReviewCardMessage, formatUpdatedReviewCardMessage } from "../templates/reviewCard";

export interface ReviewCardData {
  userId: number;
  userName: string;
  username?: string;
  reason: string;
  timestamp: Date;
  requestId: string;
  additionalMessages?: string[]; // Additional messages from user
}

export function createReviewCardKeyboard(requestId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Approve", `approve_${requestId}`)
    .text("❌ Decline", `decline_${requestId}`);
}

/**
 * Helper to retry API calls with chat migration handling
 */
async function withAdminChatIdRetry<T>(
  api: Api | Bot,
  fn: (chatId: number) => Promise<T>
): Promise<T | undefined> {
  const apiInstance = api instanceof Bot ? api.api : api;
  let chatId = env.ADMIN_REVIEW_CHAT_ID;

  try {
    return await fn(chatId);
  } catch (error: any) {
    // Handle chat migration (group upgraded to supergroup)
    if (error?.error_code === 400 && error?.parameters?.migrate_to_chat_id) {
      const newChatId = error.parameters.migrate_to_chat_id;
      console.warn(
        `Chat ${chatId} was upgraded to supergroup ${newChatId}. Update ADMIN_REVIEW_CHAT_ID in your .env file.`
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
  api: Api | Bot,
  data: ReviewCardData
): Promise<number | undefined> {
  try {
    const message = formatReviewCardMessage(data, env.TIMEZONE);
    const keyboard = createReviewCardKeyboard(data.requestId);

    const result = await withAdminChatIdRetry(api, async (chatId) => {
      const apiInstance = api instanceof Bot ? api.api : api;
      const sentMessage = await apiInstance.sendMessage(chatId, message, {
        reply_markup: keyboard,
      });
      return sentMessage.message_id;
    });

    return result;
  } catch (error) {
    console.error("Error posting review card:", error);
    return undefined;
  }
}

export async function appendMessageToReviewCard(
  api: Api | Bot,
  messageId: number,
  updatedReviewCardData: ReviewCardData
): Promise<void> {
  try {
    const message = formatReviewCardMessage(updatedReviewCardData, env.TIMEZONE);
    const keyboard = createReviewCardKeyboard(updatedReviewCardData.requestId);

    await withAdminChatIdRetry(api, async (chatId) => {
      const apiInstance = api instanceof Bot ? api.api : api;
      await apiInstance.editMessageText(chatId, messageId, message, {
        reply_markup: keyboard,
      });
    });
  } catch (error) {
    console.error("Error appending message to review card:", error);
  }
}

export async function updateReviewCard(
  api: Api | Bot,
  messageId: number,
  status: "approved" | "declined",
  adminName: string,
  originalData: ReviewCardData
): Promise<void> {
  try {
    const updatedMessage = formatUpdatedReviewCardMessage(
      originalData,
      status,
      adminName,
      env.TIMEZONE
    );

    await withAdminChatIdRetry(api, async (chatId) => {
      const apiInstance = api instanceof Bot ? api.api : api;
      await apiInstance.editMessageText(chatId, messageId, updatedMessage);
    });
  } catch (error) {
    console.error("Error updating review card:", error);
  }
}
