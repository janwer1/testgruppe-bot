import type { Bot } from "grammy";
import type { BotConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import type { BotContext } from "../../types";

export async function handleError(ctx: BotContext, error: unknown, context: string): Promise<void> {
  const _errorMessage = error instanceof Error ? error.message : "Unknown error";
  logger.error({ err: error, context }, "Error handled");

  // Try to answer callback query if it exists
  if (ctx.callbackQuery) {
    try {
      await ctx.answerCallbackQuery({
        text: "An error occurred. Please try again.",
        show_alert: true,
      });
    } catch (_e) {}
  }
}

export async function sendErrorToAdminGroup(
  // biome-ignore lint/suspicious/noExplicitAny: context-agnostic bot
  bot: Bot<any>,
  error: unknown,
  context: string,
  config: BotConfig,
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const adminMessage = `⚠️ Error in ${context}

${errorMessage}
`;

  try {
    await bot.api.sendMessage(config.adminReviewChatId, adminMessage);
  } catch (e) {
    logger.error({ err: e }, "Failed to send error to admin group");
  }
}
