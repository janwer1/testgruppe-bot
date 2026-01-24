import { Bot } from "grammy";
import { env } from "../env";

export async function isAdminInBothChats(
  bot: Bot,
  userId: number
): Promise<boolean> {
  try {
    const [targetMember, adminReviewMember] = await Promise.all([
      bot.api.getChatMember(env.TARGET_CHAT_ID, userId),
      bot.api.getChatMember(env.ADMIN_REVIEW_CHAT_ID, userId),
    ]);

    const isTargetAdmin =
      targetMember.status === "creator" ||
      targetMember.status === "administrator";
    const isReviewAdmin =
      adminReviewMember.status === "creator" ||
      adminReviewMember.status === "administrator";

    return isTargetAdmin && isReviewAdmin;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}
