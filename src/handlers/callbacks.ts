import { BotContext } from "../types";
import { isAdminInBothChats } from "../services/authz";
import { joinRequestRepository } from "../repositories/JoinRequestRepository";
import { updateReviewCard } from "../services/reviewCard";
import { handleError, sendErrorToAdminGroup } from "./errors";
import { getMessage } from "../templates/messages";

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

    // Validate requestId format: ULID (26 chars Base32)
    const isUlid = /^[0-9A-Z]{26}$/i.test(requestId);

    if (!requestId || !isUlid) {
      await ctx.answerCallbackQuery({
        text: `Invalid request ID format: ${requestId}`,
        show_alert: true,
      });
      return;
    }

    try {
      // Get request using repository
      const request = await joinRequestRepository.findById(requestId);
      if (!request) {
        await ctx.answerCallbackQuery({
          text: getMessage("request-not-found"),
          show_alert: true,
        });
        return;
      }

      const context = request.getContext();

      // Check idempotency
      if (request.isProcessed()) {
        await ctx.answerCallbackQuery({
          text: getMessage("request-processed"),
          show_alert: false,
        });
        return;
      }

      // Verify admin authorization
      const isAuthorized = await isAdminInBothChats(bot, adminId);
      if (!isAuthorized) {
        await ctx.answerCallbackQuery({
          text: getMessage("not-authorized"),
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
            await bot.api.sendMessage(context.userId, getMessage("approved-user"));
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
            text: getMessage("action-success-approved"),
            show_alert: false,
          });
        } catch (apiError) {
          await sendErrorToAdminGroup(bot, apiError, "approveChatJoinRequest");
          await ctx.answerCallbackQuery({
            text: getMessage("error-approving"),
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
            await bot.api.sendMessage(context.userId, getMessage("declined-user"));
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
            text: getMessage("action-success-declined"),
            show_alert: false,
          });
        } catch (apiError) {
          await sendErrorToAdminGroup(bot, apiError, "declineChatJoinRequest");
          await ctx.answerCallbackQuery({
            text: getMessage("error-declining"),
            show_alert: true,
          });
        }
      }
    } catch (error) {
      await handleError(ctx, error, "callback_query");
    }
  });
}
