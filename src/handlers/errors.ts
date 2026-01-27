import { BotContext } from "../types";
import { env } from "../env";

export async function handleError(
  ctx: BotContext,
  error: unknown,
  context: string
): Promise<void> {
  const errorMessage =
    error instanceof Error ? error.message : "Unknown error";
  console.error(`Error in ${context}:`, errorMessage, error);

  // Try to answer callback query if it exists
  if (ctx.callbackQuery) {
    try {
      await ctx.answerCallbackQuery({
        text: "An error occurred. Please try again.",
        show_alert: true,
      });
    } catch (e) {
    }
  }
}

export async function sendErrorToAdminGroup(
  bot: any,
  error: unknown,
  context: string
): Promise<void> {
  const errorMessage =
    error instanceof Error ? error.message : "Unknown error";
  const adminMessage = `⚠️ Error in ${context}

${errorMessage}
`;

  try {
    await bot.api.sendMessage(env.ADMIN_REVIEW_CHAT_ID, adminMessage);
  } catch (e) {
    console.error("Failed to send error to admin group:", e);
  }
}
