import type { Bot } from "grammy";
import type { BotConfig } from "../../shared/config";
import { logger } from "../../shared/logger";

// biome-ignore lint/suspicious/noExplicitAny: context-agnostic bot
export async function isAdminInBothChats(bot: Bot<any>, userId: number, config: BotConfig): Promise<boolean> {
  try {
    const [targetMember, adminReviewMember] = await Promise.all([
      bot.api.getChatMember(config.targetChatId, userId),
      bot.api.getChatMember(config.adminReviewChatId, userId),
    ]);

    const isTargetAdmin = targetMember.status === "creator" || targetMember.status === "administrator";
    const isReviewAdmin = adminReviewMember.status === "creator" || adminReviewMember.status === "administrator";

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
