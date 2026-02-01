import type { Bot } from "grammy";
import { isAdminInBothChats } from "../../application/services/authz";
import { updateReviewCard } from "../../application/services/reviewCard";
import { logger } from "../../shared/logger";
import { getMessage } from "../../templates/messages";
import type { BotContext } from "../../types";
import { handleError, safeAnswerCallbackQuery, sendErrorToAdminGroup } from "./errors";

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
      const request = await ctx.repo.findById(requestId);
      if (!request) {
        await safeAnswerCallbackQuery(ctx, {
          text: getMessage("request-not-found"),
          show_alert: true,
        });
        return;
      }

      const context = request.getContext();

      // Check idempotency
      if (request.isProcessed()) {
        await safeAnswerCallbackQuery(ctx, {
          text: getMessage("request-processed"),
          show_alert: false,
        });
        return;
      }

      // Verify admin authorization
      // TODO: Refactor authz to use context/config
      const isAuthorized = await isAdminInBothChats(bot, adminId, ctx.config);
      if (!isAuthorized) {
        await safeAnswerCallbackQuery(ctx, {
          text: getMessage("not-authorized"),
          show_alert: true,
        });
        return;
      }

      // Perform the action using domain model
      if (action === "approve") {
        try {
          // Only call the API if user is not already approved
          let userIsAlreadyApproved = false;
          try {
            await bot.api.approveChatJoinRequest(context.targetChatId, context.userId);
          } catch (apiError: unknown) {
            // If error is USER_ALREADY_PARTICIPANT, treat as success (already approved)
            const error = apiError as { description?: string };
            if (error.description?.includes("USER_ALREADY_PARTICIPANT")) {
              logger.info(
                { component: "Callback", userId: context.userId },
                "User already participant, treating as success",
              );
              userIsAlreadyApproved = true;
            } else if (error.description?.includes("HIDE_REQUESTER_MISSING")) {
              // Request no longer exists (cancelled or handled elsewhere)
              logger.info(
                { component: "Callback", userId: context.userId },
                "Request missing, treating as already processed",
              );
              userIsAlreadyApproved = true;
            } else {
              // Re-throw other errors
              throw apiError;
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
            logger.error(
              { component: "Callback", err: userError, userId: context.userId },
              "Failed to notify user of approval",
            );
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

          await safeAnswerCallbackQuery(ctx, {
            text: userIsAlreadyApproved ? getMessage("already-approved") : getMessage("action-success-approved"),
            show_alert: false,
          });
        } catch (apiError) {
          await sendErrorToAdminGroup(bot, apiError, "approveChatJoinRequest", ctx.config);
          await safeAnswerCallbackQuery(ctx, {
            text: getMessage("error-approving"),
            show_alert: true,
          });
        }
      } else if (action === "decline") {
        try {
          // Only call the API if user is not already declined
          let userIsAlreadyDeclined = false;
          try {
            await bot.api.declineChatJoinRequest(context.targetChatId, context.userId);
          } catch (apiError: unknown) {
            // If error is HIDE_REQUESTER_MISSING, treat as success (already handled/gone)
            const error = apiError as { description?: string };
            if (
              error.description?.includes("USER_NOT_PARTICIPANT") ||
              error.description?.includes("user not found") ||
              error.description?.includes("HIDE_REQUESTER_MISSING")
            ) {
              logger.info(
                { component: "Callback", userId: context.userId },
                "User not participant or request missing, treating as success/already declined",
              );
              userIsAlreadyDeclined = true;
            } else {
              // Re-throw other errors
              throw apiError;
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
            logger.error(
              { component: "Callback", err: userError, userId: context.userId },
              "Failed to notify user of decline",
            );
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

          await safeAnswerCallbackQuery(ctx, {
            text: userIsAlreadyDeclined ? getMessage("already-declined") : getMessage("action-success-declined"),
            show_alert: false,
          });
        } catch (apiError) {
          await sendErrorToAdminGroup(bot, apiError, "declineChatJoinRequest", ctx.config);
          await safeAnswerCallbackQuery(ctx, {
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
