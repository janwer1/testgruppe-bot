import type { Bot } from "grammy";
import type { BotContext } from "../types";

export function registerAdminHandlers(bot: Bot<BotContext>): void {
  bot.command("admin", async (ctx) => {
    // Check authorization (Admin Review Chat or private chat with an admin)

    if (!ctx.chat || !ctx.from) return;

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

    if (!isAuthorized) {
      return;
    }

    const args = ctx.match;
    const parsedLimit = args ? parseInt(String(args), 10) : 10;
    const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 10 : Math.min(parsedLimit, 20);

    await ctx.reply(`Fetching last ${limit} requests...`);

    const recentRequests = await ctx.repo.findRecent(limit);

    if (recentRequests.length === 0) {
      await ctx.reply("No recent join requests found.");
      return;
    }

    let message = `<b>Recent Join Requests</b>\n\n`;

    for (const req of recentRequests) {
      const context = req.getContext();
      const state = req.getState();

      let statusIcon = "⏳"; // pending/unknown
      if (state === "collectingReason") statusIcon = "📝"; // writing reason
      if (state === "awaitingReview") statusIcon = "👀"; // ready for review
      if (state === "approved") statusIcon = "✅";
      if (state === "declined") statusIcon = "❌";

      const date = new Date(context.timestamp).toLocaleString("de-DE", {
        timeZone: ctx.config.timezone,
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      message += `${statusIcon} <b>${context.userName}</b>`;
      if (context.username) message += ` (@${context.username})`;
      message += `\n📅 ${date}`;
      message += `\n🆔 <code>${context.requestId.substring(0, 8)}</code>`;

      if (context.decision) {
        message += `\n👮 ${context.decision.adminName}`;
      } else if (state === "awaitingReview") {
        // Maybe add a hint/link?
      }

      message += `\n\n`;
    }

    await ctx.reply(message, { parse_mode: "HTML" });
  });
}
