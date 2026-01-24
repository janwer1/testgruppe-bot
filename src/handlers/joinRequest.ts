import { BotContext } from "../types";
import { postReviewCard } from "../services/reviewCard";
import { joinRequestRepository } from "../repositories/JoinRequestRepository";
import { handleError } from "./errors";
import { randomBytes } from "crypto";
import type { JoinRequestInput } from "../domain/joinRequestMachine";

const DM_FAILED_MESSAGE =
  "⚠️ Could not send DM to user. They may have blocked the bot or privacy settings prevent DMs.";

export function registerJoinRequestHandler(bot: any): void {
  bot.on("chat_join_request", async (ctx: BotContext) => {
    try {
      const joinRequest = ctx.chatJoinRequest;
      if (!joinRequest) {
        return;
      }
      const userId = joinRequest.from.id;
      const targetChatId = joinRequest.chat.id;
      const user = joinRequest.from;

      // Generate unique request ID
      const requestId = randomBytes(8).toString("hex");
      const userName = `${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}`;

      // Store initial request state BEFORE entering conversation
      // Grammy's session middleware should have initialized ctx.session by now
      if (!ctx.session) {
        console.error(`[Join Request] Session not initialized for user ${userId}, chatId: ${ctx.chat?.id}`);
        // Still try to enter conversation - Grammy might initialize session
      } else {
        ctx.session.requestId = requestId;
        ctx.session.requestingUserId = userId;
        ctx.session.targetChatId = targetChatId;
      }

      console.log(`[Join Request] User ${userId} requested to join. Request ID: ${requestId}`);

      // Create join request using repository
      const input: JoinRequestInput = {
        requestId,
        userId,
        targetChatId,
        userName,
        username: user.username,
        timestamp: Date.now(),
      };

      const request = await joinRequestRepository.create(input);

          // Try to send DM and start conversation
          try {
            console.log(`[Join Request] Entering conversation for user ${userId}...`);

            // Enter conversation to collect reason (conversation will send the DM)
            await ctx.conversation.enter("collectReason");
      } catch (dmError) {
        // User may have blocked bot or privacy settings prevent DMs
        console.error("Failed to send DM to user:", dmError);

        // Still post a review card to admins indicating DM failed
        const reviewCardData = {
          userId,
          userName,
          username: user.username,
          reason: DM_FAILED_MESSAGE,
          timestamp: new Date(),
          requestId,
          additionalMessages: [],
        };

        const adminMsgId = await postReviewCard(ctx.api, reviewCardData);
        if (adminMsgId) {
          // Update request with reason and adminMsgId via domain model
          request.submitReason(DM_FAILED_MESSAGE);
          request.setAdminMsgId(adminMsgId);
          // Save the request
          await joinRequestRepository.save(request);
        }

        return;
      }
    } catch (error) {
      await handleError(ctx, error, "joinRequest");
    }
  });
}
