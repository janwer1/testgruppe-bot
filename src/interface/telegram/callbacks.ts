import type { Bot } from "grammy";
import { JoinRequestService } from "../../application/services/joinRequestService";
import type { BotContext } from "../../types";
import { handleError, safeAnswerCallbackQuery } from "./errors";

export function registerCallbackHandlers(bot: Bot<BotContext>): void {
  bot.on("callback_query:data", async (ctx: BotContext) => {
    if (!ctx.callbackQuery || !ctx.from) {
      return;
    }
    const data = ctx.callbackQuery.data;
    const adminId = ctx.from.id;
    const adminName = ctx.from.username || ctx.from.first_name || "Unknown";

    if (!data) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Invalid callback data",
        show_alert: true,
      });
      return;
    }

    // Parse callback data
    const [action, requestId] = data.split("_", 2);

    if (action !== "approve" && action !== "decline") {
      await safeAnswerCallbackQuery(ctx, {
        text: "Unknown action",
        show_alert: true,
      });
      return;
    }

    const isUlid = /^[0-9A-Z]{26}$/i.test(requestId);

    if (!requestId || !isUlid) {
      await safeAnswerCallbackQuery(ctx, {
        text: `Invalid request ID format: ${requestId}`,
        show_alert: true,
      });
      return;
    }

    try {
      // Get request using repository
      const service = new JoinRequestService(ctx.repo, ctx.config, bot);
      const result = await service.handleAdminAction(requestId, adminId, adminName, action);

      if (!result.ok) {
        await safeAnswerCallbackQuery(ctx, {
          text: result.message,
          show_alert: true,
        });
        return;
      }

      await safeAnswerCallbackQuery(ctx, {
        text: result.message,
        show_alert: false,
      });
    } catch (error) {
      await handleError(ctx, error, "callback_query");
    }
  });
}
