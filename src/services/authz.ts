import type { Bot } from "grammy";
import type { BotConfig } from "../config";

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
    console.error("Error checking admin status:", error);
    return false;
  }
}
