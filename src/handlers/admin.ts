import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { JoinRequest } from "../domain/JoinRequest";
import type { BotContext } from "../types";
import { formatDate } from "../utils/date";

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
      console.error(`[Admin] Failed to verify admin status for user ${userId}:`, e);
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

    message += `${statusIcon} <b>${context.userName}</b>`;
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

    const recentRequests = await ctx.repo.findRecent(limit);

    // Filter for pending states
    const pendingRequests = recentRequests.filter((req) => {
      const state = req.getState();
      return state === "pending" || state === "collectingReason" || state === "awaitingReview";
    });

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

    const recentRequests = await ctx.repo.findRecent(limit);

    // Filter for completed states
    const completedRequests = recentRequests.filter((req) => {
      const state = req.getState();
      return state === "approved" || state === "declined";
    });

    const message = `<b>Completed Join Requests</b>\n\n${formatRequestList(completedRequests, ctx.config.timezone)}`;
    await ctx.reply(message, { parse_mode: "HTML" });
  });

  // Callback query handler for menu buttons
  bot.callbackQuery(/^admin:(pending|completed)$/, async (ctx) => {
    const isAuthorized = await checkAdminAuth(ctx);
    if (!isAuthorized) {
      await ctx.answerCallbackQuery("❌ Not authorized");
      return;
    }

    const action = ctx.match[1];
    await ctx.answerCallbackQuery();

    const limit = 10;
    const recentRequests = await ctx.repo.findRecent(limit);

    let filteredRequests: JoinRequest[];
    let title: string;

    if (action === "pending") {
      filteredRequests = recentRequests.filter((req) => {
        const state = req.getState();
        return state === "pending" || state === "collectingReason" || state === "awaitingReview";
      });
      title = "Pending Join Requests";
    } else {
      filteredRequests = recentRequests.filter((req) => {
        const state = req.getState();
        return state === "approved" || state === "declined";
      });
      title = "Completed Join Requests";
    }

    const message = `<b>${title}</b>\n\n${formatRequestList(filteredRequests, ctx.config.timezone)}`;

    // Edit the message instead of sending a new one
    await ctx.editMessageText(message, { parse_mode: "HTML" });
  });
}
