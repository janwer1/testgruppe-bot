import type { Bot } from "grammy";
import { isAdminInBothChats } from "../services/authz";
import { updateReviewCard } from "../services/reviewCard";
import { getMessage } from "../templates/messages";
import type { BotContext } from "../types";
import { handleError, sendErrorToAdminGroup } from "./errors";

export function registerCallbackHandlers(bot: Bot<BotContext>): void {
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

    // Parse callback data
    const [action, requestId] = data.split("_", 2);

    if (action !== "approve" && action !== "decline") {
      await ctx.answerCallbackQuery({
        text: "Unknown action",
        show_alert: true,
      });
      return;
    }

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
      const request = await ctx.repo.findById(requestId);
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
      // TODO: Refactor authz to use context/config
      const isAuthorized = await isAdminInBothChats(bot, adminId, ctx.config);
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
          // First, check if user is already a chat member
          let userIsAlreadyApproved = false;
          try {
            const member = await bot.api.getChatMember(context.targetChatId, context.userId);
            // If user is already a member, administrator, or creator, they're approved
            if (member.status === "member" || member.status === "administrator" || member.status === "creator") {
              userIsAlreadyApproved = true;
              console.log(`[Callback] User ${context.userId} is already in chat with status: ${member.status}`);
            }
          } catch (memberError) {
            // User not found in chat, proceed with approval attempt
            console.log(`[Callback] User ${context.userId} not in chat, will attempt approval`);
          }

          // Only call the API if user is not already approved
          if (!userIsAlreadyApproved) {
            try {
              await bot.api.approveChatJoinRequest(context.targetChatId, context.userId);
            } catch (apiError: unknown) {
              // If error is USER_ALREADY_PARTICIPANT, treat as success
              const error = apiError as { description?: string };
              if (error.description?.includes("USER_ALREADY_PARTICIPANT")) {
                console.log(`[Callback] User ${context.userId} already participant, treating as success`);
                userIsAlreadyApproved = true;
              } else {
                // Re-throw other errors
                throw apiError;
              }
            }
          }

          // Use domain model to approve
          const approveResult = request.approve(adminId, adminName);
          if (!approveResult.success) {
            throw new Error(approveResult.error || "Failed to approve request");
          }

          // Save updated request
          await ctx.repo.save(request);

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
              displayName: context.displayName,
              username: context.username,
              reason: context.reason || "",
              timestamp: new Date(context.timestamp),
              requestId,
              additionalMessages: context.additionalMessages,
            },
            ctx.config,
          );

          await ctx.answerCallbackQuery({
            text: userIsAlreadyApproved ? getMessage("already-approved") : getMessage("action-success-approved"),
            show_alert: false,
          });
        } catch (apiError) {
          await sendErrorToAdminGroup(bot, apiError, "approveChatJoinRequest", ctx.config);
          await ctx.answerCallbackQuery({
            text: getMessage("error-approving"),
            show_alert: true,
          });
        }
      } else if (action === "decline") {
        try {
          // First, check if user is already NOT in chat (or was kicked/left)
          let userIsAlreadyDeclined = false;
          try {
            const member = await bot.api.getChatMember(context.targetChatId, context.userId);
            // If user left, was kicked, or is restricted, they're effectively declined
            if (member.status === "left" || member.status === "kicked" || member.status === "restricted") {
              userIsAlreadyDeclined = true;
              console.log(`[Callback] User ${context.userId} already not in chat with status: ${member.status}`);
            }
          } catch (memberError) {
            // User not found in chat, likely already declined or never joined
            const error = memberError as { description?: string };
            if (error.description?.includes("user not found") || error.description?.includes("USER_NOT_PARTICIPANT")) {
              userIsAlreadyDeclined = true;
              console.log(`[Callback] User ${context.userId} not found in chat, treating as already declined`);
            }
          }

          // Only call the API if user is not already declined
          if (!userIsAlreadyDeclined) {
            try {
              await bot.api.declineChatJoinRequest(context.targetChatId, context.userId);
            } catch (apiError: unknown) {
              // If error is USER_NOT_PARTICIPANT, treat as success
              const error = apiError as { description?: string };
              if (
                error.description?.includes("USER_NOT_PARTICIPANT") ||
                error.description?.includes("user not found")
              ) {
                console.log(`[Callback] User ${context.userId} not participant, treating as success`);
                userIsAlreadyDeclined = true;
              } else {
                // Re-throw other errors
                throw apiError;
              }
            }
          }

          // Use domain model to decline
          const declineResult = request.decline(adminId, adminName);
          if (!declineResult.success) {
            throw new Error(declineResult.error || "Failed to decline request");
          }

          // Save updated request
          await ctx.repo.save(request);

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
              displayName: context.displayName,
              username: context.username,
              reason: context.reason || "",
              timestamp: new Date(context.timestamp),
              requestId,
              additionalMessages: context.additionalMessages,
            },
            ctx.config,
          );

          await ctx.answerCallbackQuery({
            text: userIsAlreadyDeclined ? getMessage("already-declined") : getMessage("action-success-declined"),
            show_alert: false,
          });
        } catch (apiError) {
          await sendErrorToAdminGroup(bot, apiError, "declineChatJoinRequest", ctx.config);
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
