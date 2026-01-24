import { BotContext } from "../types";
import { isAdminInBothChats } from "../services/authz";
import { joinRequestRepository } from "../repositories/JoinRequestRepository";
import { updateReviewCard } from "../services/reviewCard";
import { handleError, sendErrorToAdminGroup } from "./errors";

const APPROVED_MESSAGE =
  "✅ Congratulations! Your request to join has been approved!";
const DECLINED_MESSAGE =
  "❌ Unfortunately, your request to join was declined.";

export function registerCallbackHandlers(bot: any): void {
  bot.on("callback_query:data", async (ctx: BotContext) => {
    if (!ctx.callbackQuery || !ctx.from) {
      return;
    }
    const data = ctx.callbackQuery.data;
    const adminId = ctx.from.id;
    const adminName = ctx.from.username || ctx.from.first_name || "Unknown";

    if (!data) {
      await ctx.answerCallbackQuery({
        text: "Invalid callback data",
        show_alert: true,
      });
      return;
    }

    // Parse callback data: approve_<requestId> or decline_<requestId>
    const [action, requestId] = data.split("_", 2);

    if (action !== "approve" && action !== "decline") {
      await ctx.answerCallbackQuery({
        text: "Unknown action",
        show_alert: true,
      });
      return;
    }

    // Validate requestId format (should be hex string, 16 chars from randomBytes(8))
    if (!requestId || !/^[a-f0-9]{16}$/.test(requestId)) {
      await ctx.answerCallbackQuery({
        text: "Invalid request ID format",
        show_alert: true,
      });
      return;
    }

    try {
      // Get request using repository
      const request = await joinRequestRepository.findById(requestId);
      if (!request) {
        await ctx.answerCallbackQuery({
          text: "Request not found or expired",
          show_alert: true,
        });
        return;
      }

      const context = request.getContext();

      // Check idempotency
      if (request.isProcessed()) {
        await ctx.answerCallbackQuery({
          text: "This request has already been processed",
          show_alert: false,
        });
        return;
      }

      // Verify admin authorization
      const isAuthorized = await isAdminInBothChats(bot, adminId);
      if (!isAuthorized) {
        await ctx.answerCallbackQuery({
          text: "Not authorized. You must be an admin in both the target chat and admin review chat.",
          show_alert: true,
        });
        return;
      }

      // Perform the action using domain model
      if (action === "approve") {
        try {
          await bot.api.approveChatJoinRequest(
            context.targetChatId,
            context.userId
          );

          // Use domain model to approve
          const approveResult = request.approve(adminId, adminName);
          if (!approveResult.success) {
            throw new Error(approveResult.error || "Failed to approve request");
          }

          // Save updated request
          await joinRequestRepository.save(request);

          // Notify user
          try {
            await bot.api.sendMessage(context.userId, APPROVED_MESSAGE);
          } catch (userError) {
            console.error("Failed to notify user of approval:", userError);
          }

          // Update review card
          await updateReviewCard(
            bot,
            context.adminMsgId || 0,
            "approved",
            adminName,
            {
              userId: context.userId,
              userName: context.userName,
              username: context.username,
              reason: context.reason || "",
              timestamp: new Date(context.timestamp),
              requestId,
              additionalMessages: context.additionalMessages,
            }
          );

          await ctx.answerCallbackQuery({
            text: "Request approved!",
            show_alert: false,
          });
        } catch (apiError) {
          await sendErrorToAdminGroup(bot, apiError, "approveChatJoinRequest");
          await ctx.answerCallbackQuery({
            text: "Error approving request. Please try again.",
            show_alert: true,
          });
        }
      } else if (action === "decline") {
        try {
          await bot.api.declineChatJoinRequest(
            context.targetChatId,
            context.userId
          );

          // Use domain model to decline
          const declineResult = request.decline(adminId, adminName);
          if (!declineResult.success) {
            throw new Error(declineResult.error || "Failed to decline request");
          }

          // Save updated request
          await joinRequestRepository.save(request);

          // Notify user
          try {
            await bot.api.sendMessage(context.userId, DECLINED_MESSAGE);
          } catch (userError) {
            console.error("Failed to notify user of decline:", userError);
          }

          // Update review card
          await updateReviewCard(
            bot,
            context.adminMsgId || 0,
            "declined",
            adminName,
            {
              userId: context.userId,
              userName: context.userName,
              username: context.username,
              reason: context.reason || "",
              timestamp: new Date(context.timestamp),
              requestId,
              additionalMessages: context.additionalMessages,
            }
          );

          await ctx.answerCallbackQuery({
            text: "Request declined!",
            show_alert: false,
          });
        } catch (apiError) {
          await sendErrorToAdminGroup(bot, apiError, "declineChatJoinRequest");
          await ctx.answerCallbackQuery({
            text: "Error declining request. Please try again.",
            show_alert: true,
          });
        }
      }
    } catch (error) {
      await handleError(ctx, error, "callback_query");
    }
  });
}
