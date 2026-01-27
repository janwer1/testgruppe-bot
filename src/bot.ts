import { Bot } from "grammy";
import type { BotConfig } from "./config";
import { registerAdminHandlers } from "./handlers/admin";
import { registerCallbackHandlers } from "./handlers/callbacks";
import { registerJoinRequestHandler } from "./handlers/joinRequest";
import type { IJoinRequestRepository } from "./repositories/JoinRequestRepository";
import { logger } from "./services/logger";
import type { BotContext } from "./types";

export function createBot(config: BotConfig, repo: IJoinRequestRepository): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.botToken);

  // Stateless architecture: Loads state from Redis on every request.

  // Inject dependencies into context
  bot.use(async (ctx, next) => {
    ctx.config = config;
    ctx.repo = repo;
    await next();
  });

  // Request logging middleware
  bot.use(async (ctx, next) => {
    // Only log strictly interesting events
    if (ctx.chat?.type === "private" && ctx.message?.text) {
      logger.info(
        {
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
        console.log(`[Router] Ignored message from ${userId}: No active request`);
      }
      return;
    }

    // Verify security: Request must belong to message sender
    if (request.getContext().userId !== userId) {
      console.error(
        `[Router] Security Mismatch! Loaded request for ${request.getContext().userId} but msg from ${userId}`,
      );
      return;
    }

    if (request.getContext().targetChatId !== config.targetChatId) {
      console.warn(
        `[Router] Target chat mismatch. Request: ${request.getContext().targetChatId}, Config: ${config.targetChatId}`,
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
      const { validateReason } = await import("./utils/validation");

      const validation = validateReason(text, config);
      if (!validation.success) {
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
      const userName = `${firstName}${lastName ? ` ${lastName}` : ""}`.trim();

      const reviewCardData = {
        userId: request.getContext().userId,
        userName,
        username: user.username,
        reason,
        timestamp: new Date(request.getContext().timestamp),
        requestId: request.getContext().requestId,
        additionalMessages: [],
      };

      const { postReviewCard } = await import("./services/reviewCard");
      const adminMsgId = await postReviewCard(ctx.api, reviewCardData, config);

      const { getMessage } = await import("./templates/messages");

      if (adminMsgId) {
        request.setAdminMsgId(adminMsgId);
        await repo.save(request); // Save adminMsgId

        await ctx.reply(getMessage("thank-you"));
      } else {
        console.error(`[Router] Failed to post review card for user ${userId}`);
        await ctx.reply(
          "Your request has been saved, but we couldn't notify the admins immediately. We will review it shortly.",
        );
      }
      return;
    }

    if (currentState === "awaitingReview") {
      const { validateAdditionalMessage } = await import("./utils/validation");
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
          const { appendMessageToReviewCard } = await import("./services/reviewCard");
          const reviewCardData = {
            userId: context.userId,
            userName: context.userName,
            username: context.username,
            reason: context.reason || "",
            timestamp: new Date(context.timestamp),
            requestId: context.requestId,
            additionalMessages: context.additionalMessages,
          };

          await appendMessageToReviewCard(ctx.api, context.adminMsgId, reviewCardData, config);
        } catch (error) {
          console.error(`[Router] Failed to update admin card for user ${userId}:`, error);
        }
      } else {
        console.warn(`[Router] Message added but no adminMsgId for user ${userId}`);
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
