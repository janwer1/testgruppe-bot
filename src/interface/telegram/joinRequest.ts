import type { Bot } from "grammy";
import { JoinRequestService } from "../../application/services/joinRequestService";
import type { BotContext } from "../../types";
import { handleError } from "./errors";

export function registerJoinRequestHandler(bot: Bot<BotContext>): void {
  bot.on("chat_join_request", async (ctx: BotContext) => {
    try {
      const joinRequest = ctx.chatJoinRequest;
      if (!joinRequest) {
        return;
      }
      const targetChatId = joinRequest.chat.id;
      const user = joinRequest.from;
      const service = new JoinRequestService(ctx.repo, ctx.config, ctx.api);
      await service.initializeRequest(user, targetChatId, joinRequest.user_chat_id);
    } catch (error) {
      await handleError(ctx, error, "joinRequest");
      // Re-throw error to force Telegram to retry the webhook
      throw error;
    }
  });
}
