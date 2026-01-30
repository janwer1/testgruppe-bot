import { ulid } from "@std/ulid";
import type { Bot } from "grammy";
import type { JoinRequestInput } from "../domain/joinRequestMachine";
import { postReviewCard } from "../services/reviewCard";
import { getMessage } from "../templates/messages";
import type { BotContext } from "../types";
import { handleError } from "./errors";

export function registerJoinRequestHandler(bot: Bot<BotContext>): void {
  bot.on("chat_join_request", async (ctx: BotContext) => {
    try {
      const joinRequest = ctx.chatJoinRequest;
      if (!joinRequest) {
        return;
      }
      const userId = joinRequest.from.id;
      const targetChatId = joinRequest.chat.id;
      const user = joinRequest.from;

      // Generate unique request ID using ULID (Universally Unique Lexicographically Sortable Identifier)
      // This allows sorting by ID to equate to sorting by time
      const requestId = ulid();
      const displayName = `${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}`;

      // Stateless architecture: all state is persisted via JoinRequestRepository

      console.log(`[Join Request] User ${userId} requested to join. Request ID: ${requestId}`);

      // Create join request using repository
      const input: JoinRequestInput = {
        config: ctx.config,
        requestId,
        userId,
        targetChatId,
        displayName,
        username: user.username,
        timestamp: Date.now(),
      };

      const request = await ctx.repo.create(input);

      // Manually start collection state (skipping machine validation since it's fresh)
      // This ensures state is "collectingReason" before we even send the DM
      request.startCollection();
      await ctx.repo.save(request);

      // Try to send DM with the welcome message
      try {
        console.log(`[Join Request] Sending welcome DM to user ${userId}...`);

        const recipientId = joinRequest.user_chat_id || userId;

        await ctx.api.sendMessage(
          recipientId,
          getMessage("welcome", { minWords: ctx.config.minReasonWords, maxChars: ctx.config.maxReasonChars }),
        );
      } catch (dmError) {
        console.error("Failed to send DM to user:", dmError);

        const failureReason = getMessage("dm-failed");

        // Still post a review card to admins indicating DM failed
        const reviewCardData = {
          userId,
          displayName,
          username: user.username,
          reason: failureReason,
          timestamp: new Date(),
          requestId,
          additionalMessages: [],
        };

        const adminMsgId = await postReviewCard(ctx.api, reviewCardData, ctx.config);
        if (adminMsgId) {
          // Domain model requires "collectingReason" state for submitReason.
          // Since we called startCollection() above, we are good.
          request.submitReason(failureReason);
          request.setAdminMsgId(adminMsgId);
          // Save the request
          await ctx.repo.save(request);
        }

        return;
      }
    } catch (error) {
      await handleError(ctx, error, "joinRequest");
      // Re-throw error to force Telegram to retry the webhook
      throw error;
    }
  });
}
