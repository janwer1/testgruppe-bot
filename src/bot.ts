import { Bot } from "grammy";
import type { IJoinRequestRepository } from "./infrastructure/persistence/JoinRequestRepository";
import { registerAdminHandlers } from "./interface/telegram/admin";
import { registerCallbackHandlers } from "./interface/telegram/callbacks";
import { registerJoinRequestHandler } from "./interface/telegram/joinRequest";
import type { BotConfig } from "./shared/config";
import { logger } from "./shared/logger";
import type { BotContext } from "./types";

export function createBot(config: BotConfig, repo: IJoinRequestRepository): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.botToken);

  // Stateless architecture: Loads state from D1 on every request.

  // Inject dependencies into context
  bot.use(async (ctx, next) => {
    ctx.config = config;
    ctx.repo = repo;
    await next();
  });

  // Debug: Log every update to ensure we are receiving them
  bot.use(async (ctx, next) => {
    logger.debug(
      {
        component: "Update",
        updateId: ctx.update.update_id,
        type: Object.keys(ctx.update).filter((k) => k !== "update_id")[0],
      },
      "Received Update",
    );
    await next();
  });

  // Request logging middleware
  bot.use(async (ctx, next) => {
    // Only log strictly interesting events
    if (ctx.chat?.type === "private" && ctx.message?.text) {
      logger.info(
        {
          component: "Bot",
          userId: ctx.from?.id,
          text: ctx.message.text,
        },
        "Private Message Received",
      );
    }
    await next();
  });

  // Register Admin handlers first to intercept commands.
  registerAdminHandlers(bot);

  // Message Router: Handles user input based on their current request state.
  bot.on("message:text", async (ctx: BotContext) => {
    if (!ctx.chat || !ctx.from || !ctx.message || !ctx.message.text) {
      return;
    }

    if (ctx.chat.type !== "private") {
      return;
    }

    const userId = ctx.from.id;

    // Load active request state
    const request = await repo.findByUserId(userId);

    if (!request) {
      // Access MODE from process.env directly or add to config if critical
      if (process.env.NODE_ENV !== "production") {
        logger.info({ userId }, "Ignored message: No active request");
      }
      return;
    }

    // Verify security: Request must belong to message sender
    if (request.getContext().userId !== userId) {
      logger.error(
        { requestUserId: request.getContext().userId, messageUserId: userId },
        "Security Mismatch! Loaded request for different user",
      );
      return;
    }

    if (request.getContext().targetChatId !== config.targetChatId) {
      logger.warn(
        { requestTargetChatId: request.getContext().targetChatId, configTargetChatId: config.targetChatId },
        "Target chat mismatch",
      );
      return;
    }

    if (request.isProcessed()) {
      await ctx.reply("Request already processed");
      return;
    }

    const text = ctx.message.text.trim();
    const currentState = request.getState();

    if (currentState === "collectingReason") {
      const { validateReason } = await import("./domain/validation");

      const validation = validateReason(text, config);
      if (!validation.success) {
        logger.info({ userId, error: validation.error, textLength: text.length }, "Validation failed");
        await ctx.reply(validation.error || "Invalid input");
        return;
      }

      const reason = validation.data;

      // Update State
      request.submitReason(reason);
      // Ensure reason is saved even if posting to admin group fails
      await repo.save(request);

      // Post Review Card
      const user = ctx.from;
      const firstName = user.first_name || "User";
      const lastName = user.last_name || "";
      const displayName = `${firstName}${lastName ? ` ${lastName}` : ""}`.trim();

      const reviewCardData = {
        userId: request.getContext().userId,
        displayName,
        username: user.username,
        reason,
        timestamp: new Date(request.getContext().timestamp),
        requestId: request.getContext().requestId,
        additionalMessages: [],
      };

      const { postReviewCard } = await import("./application/services/reviewCard");
      const adminMsgId = await postReviewCard(ctx.api, reviewCardData, config);

      const { getMessage } = await import("./templates/messages");

      if (adminMsgId) {
        request.setAdminMsgId(adminMsgId);
        await repo.save(request); // Save adminMsgId

        await ctx.reply(getMessage("thank-you"));
      } else {
        logger.error({ userId }, "Failed to post review card");
        await ctx.reply(
          "Your request has been saved, but we couldn't notify the admins immediately. We will review it shortly.",
        );
      }
      return;
    }

    if (currentState === "awaitingReview") {
      const { validateAdditionalMessage } = await import("./domain/validation");
      const validation = validateAdditionalMessage(text, config);

      if (!validation.success) {
        // Silent fail or soft warn? Let's warn softly
        await ctx.reply(validation.error || "Message too short/long");
        return;
      }

      const message = validation.data;

      // Update State
      request.addMessage(message);
      await repo.save(request); // PERSIST IMMEDIATELY

      const { getMessage } = await import("./templates/messages");

      // Update Admin Card
      const context = request.getContext();
      if (context.adminMsgId) {
        try {
          const { appendMessageToReviewCard } = await import("./application/services/reviewCard");
          const reviewCardData = {
            userId: context.userId,
            displayName: context.displayName,
            username: context.username,
            reason: context.reason || "",
            timestamp: new Date(context.timestamp),
            requestId: context.requestId,
            additionalMessages: context.additionalMessages,
          };

          await appendMessageToReviewCard(ctx.api, context.adminMsgId, reviewCardData, config);
        } catch (error) {
          logger.error({ err: error, userId }, "Failed to update admin card");
        }
      } else {
        logger.warn({ userId }, "Message added but no adminMsgId");
      }

      await ctx.reply(getMessage("msg-added"));
      return;
    }
  });

  // Register other handlers
  registerJoinRequestHandler(bot);
  registerCallbackHandlers(bot);

  return bot;
}
