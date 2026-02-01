import type { Bot } from "grammy";
import type { BotConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import type { BotContext } from "../../types";

function isExpiredCallbackQueryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  // grammY formats this as:
  // "GrammyError: Call to 'answerCallbackQuery' failed! (400: Bad Request: query is too old ...)"
  return (
    message.includes("answerCallbackQuery") &&
    (message.includes("query is too old") ||
      message.includes("response timeout expired") ||
      message.includes("query ID is invalid") ||
      message.includes("QUERY_ID_INVALID"))
  );
}

export async function safeAnswerCallbackQuery(
  ctx: Pick<BotContext, "answerCallbackQuery">,
  // biome-ignore lint/suspicious/noExplicitAny: grammY payload typing depends on context generics
  payload?: any,
): Promise<void> {
  try {
    // grammY supports both string and object payloads.
    // biome-ignore lint/suspicious/noExplicitAny: see above
    await (ctx as any).answerCallbackQuery(payload);
  } catch (e) {
    if (isExpiredCallbackQueryError(e)) {
      // This is a common edge case: user pressed an old button or Telegram retried.
      // Do not treat it as a webhook failure.
      logger.info({ component: "Callback", err: e }, "Ignoring expired callback query");
      return;
    }

    logger.warn({ component: "Callback", err: e }, "Failed to answer callback query");
  }
}

export async function handleError(ctx: BotContext, error: unknown, context: string): Promise<void> {
  const _errorMessage = error instanceof Error ? error.message : "Unknown error";
  logger.error({ err: error, context }, "Error handled");

  // Try to answer callback query if it exists
  if (ctx.callbackQuery) {
    await safeAnswerCallbackQuery(ctx, {
      text: "An error occurred. Please try again.",
      show_alert: true,
    });
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
