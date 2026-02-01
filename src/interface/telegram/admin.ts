import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { JoinRequest } from "../../domain/JoinRequest";
import { logger } from "../../shared/logger";
import { formatDate } from "../../shared/utils/date";
import type { BotContext } from "../../types";
import { isMessageNotModifiedError, safeAnswerCallbackQuery } from "./errors";

/**
 * Check if user is authorized to use admin commands
 */
async function checkAdminAuth(ctx: BotContext): Promise<boolean> {
  if (!ctx.chat || !ctx.from) return false;

  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const isPrivate = ctx.chat.type === "private";
  const isAdminReviewChat = chatId === ctx.config.adminReviewChatId;

  let isAuthorized = isAdminReviewChat;

  if (!isAuthorized && isPrivate) {
    try {
      const member = await ctx.api.getChatMember(ctx.config.adminReviewChatId, userId);
      if (["creator", "administrator"].includes(member.status)) {
        isAuthorized = true;
      }
    } catch (e) {
      logger.error({ err: e, userId }, "[Admin] Failed to verify admin status");
    }
  }

  return isAuthorized;
}

/**
 * Format a list of requests for display
 */
function formatRequestList(requests: JoinRequest[], timezone: string): string {
  if (requests.length === 0) {
    return "No requests found.";
  }

  let message = "";

  for (const req of requests) {
    const context = req.getContext();
    const state = req.getState();

    let statusIcon = "⏳"; // pending/unknown
    if (state === "collectingReason") statusIcon = "📝";
    if (state === "awaitingReview") statusIcon = "👀";
    if (state === "approved") statusIcon = "✅";
    if (state === "declined") statusIcon = "❌";

    const date = formatDate(context.timestamp, timezone);

    message += `${statusIcon} <b>${context.displayName}</b>`;
    if (context.username) message += ` (@${context.username})`;
    message += `\n📅 ${date}`;
    message += `\n🆔 <code>${context.requestId.substring(0, 8)}</code>`;

    if (context.decision) {
      message += `\n👮 ${context.decision.adminName}`;
    }

    message += `\n\n`;
  }

  return message;
}

export function registerAdminHandlers(bot: Bot<BotContext>): void {
  // Main admin menu
  bot.command("admin", async (ctx) => {
    const isAuthorized = await checkAdminAuth(ctx);
    if (!isAuthorized) return;

    const keyboard = new InlineKeyboard()
      .text("📋 Pending Requests", "admin:pending")
      .row()
      .text("✅ Completed Requests", "admin:completed");

    await ctx.reply("<b>Admin Dashboard</b>\n\nSelect a view:", {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // Pending requests command
  bot.command("pending", async (ctx) => {
    const isAuthorized = await checkAdminAuth(ctx);
    if (!isAuthorized) return;

    const args = ctx.match;
    const parsedLimit = args ? parseInt(String(args), 10) : 10;
    const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 10 : Math.min(parsedLimit, 20);

    await ctx.reply(`Fetching last ${limit} pending requests...`);

    const pendingRequests = await ctx.repo.findRecentByStatus({ status: "pending", limit });

    const message = `<b>Pending Join Requests</b>\n\n${formatRequestList(pendingRequests, ctx.config.timezone)}`;
    await ctx.reply(message, { parse_mode: "HTML" });
  });

  // Completed requests command
  bot.command("completed", async (ctx) => {
    const isAuthorized = await checkAdminAuth(ctx);
    if (!isAuthorized) return;

    const args = ctx.match;
    const parsedLimit = args ? parseInt(String(args), 10) : 10;
    const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 10 : Math.min(parsedLimit, 20);

    await ctx.reply(`Fetching last ${limit} completed requests...`);

    const completedRequests = await ctx.repo.findRecentByStatus({ status: "completed", limit });

    const message = `<b>Completed Join Requests</b>\n\n${formatRequestList(completedRequests, ctx.config.timezone)}`;
    await ctx.reply(message, { parse_mode: "HTML" });
  });

  // Cleanup: list pending and optionally mark all as stale (declined)
  const CLEANUP_LIMIT = 100;

  bot.command("cleanup", async (ctx) => {
    const isAuthorized = await checkAdminAuth(ctx);
    if (!isAuthorized) return;

    const confirm = ctx.match?.trim().toLowerCase() === "confirm";

    if (confirm) {
      const pending = await ctx.repo.findRecentByStatus({ status: "pending", limit: CLEANUP_LIMIT });
      const requestIds = pending.map((r) => r.getContext().requestId);

      if (requestIds.length === 0) {
        await ctx.reply("No pending requests to clean.");
        return;
      }

      const marked = await ctx.repo.markPendingAsStaleResolved(requestIds, "system");
      logger.info({ component: "Admin", marked, total: requestIds.length }, "Cleanup: marked pending as stale");
      await ctx.reply(`Marked ${marked} pending request(s) as stale (declined).`);
      return;
    }

    const pending = await ctx.repo.findRecentByStatus({ status: "pending", limit: CLEANUP_LIMIT });

    if (pending.length === 0) {
      await ctx.reply("No pending requests.");
      return;
    }

    const list = formatRequestList(pending, ctx.config.timezone);
    await ctx.reply(
      `<b>Pending (stale cleanup)</b>\n\n${list}To mark all ${pending.length} as stale, send:\n<code>/cleanup confirm</code>`,
      { parse_mode: "HTML" },
    );
  });

  // Callback query handler for menu buttons
  bot.callbackQuery(/^admin:(pending|completed)$/, async (ctx) => {
    const isAuthorized = await checkAdminAuth(ctx);
    if (!isAuthorized) {
      await safeAnswerCallbackQuery(ctx, "❌ Not authorized");
      return;
    }

    const action = ctx.match[1];
    await safeAnswerCallbackQuery(ctx);

    const limit = 10;

    let filteredRequests: JoinRequest[];
    let title: string;

    if (action === "pending") {
      filteredRequests = await ctx.repo.findRecentByStatus({ status: "pending", limit });
      title = "Pending Join Requests";
    } else {
      filteredRequests = await ctx.repo.findRecentByStatus({ status: "completed", limit });
      title = "Completed Join Requests";
    }

    const message = `<b>${title}</b>\n\n${formatRequestList(filteredRequests, ctx.config.timezone)}`;

    try {
      await ctx.editMessageText(message, { parse_mode: "HTML" });
    } catch (e) {
      if (isMessageNotModifiedError(e)) {
        logger.info({ component: "Admin", action }, "Edit skipped: message unchanged");
        return;
      }
      throw e;
    }
  });
}
