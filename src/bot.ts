import { Bot } from "grammy";
import { BotContext } from "./types";
import { registerJoinRequestHandler } from "./handlers/joinRequest";
import { registerCallbackHandlers } from "./handlers/callbacks";
import { registerAdminHandlers } from "./handlers/admin";
import { joinRequestRepository } from "./repositories/JoinRequestRepository";
import { env } from "./env";
import { logger } from "./services/logger";

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  // Stateless architecture: Loads state from Redis on every request.

  // Request logging middleware
  bot.use(async (ctx, next) => {
    // Only log strictly interesting events
    if (ctx.chat?.type === "private" && ctx.message?.text) {
      logger.info({
        userId: ctx.from?.id,
        text: ctx.message.text,
      }, "Private Message Received");
    }
    await next();
  });

  // Register Admin handlers first to intercept commands.
  registerAdminHandlers(bot);

  // Message Router: Handles user input based on their current request state.
  bot.on("message:text", async (ctx: BotContext) => {
    // GUARD: Ensure context has necessary data (TS narrowing)
    if (!ctx.chat || !ctx.from || !ctx.message || !ctx.message.text) {
      return;
    }

    // GUARD: Only accept messages from private chats
    if (ctx.chat.type !== "private") {
      return;
    }

    const userId = ctx.from.id;

    // Load active request state
    const request = await joinRequestRepository.findByUserId(userId);

    if (!request) {
      if (env.MODE === "dev") {
        console.log(`[Router] Ignored message from ${userId}: No active request`);
      }
      return;
    }

    // Verify security: Request must belong to message sender
    if (request.getContext().userId !== userId) {
      console.error(`[Router] Security Mismatch! Loaded request for ${request.getContext().userId} but msg from ${userId}`);
      return;
    }

    if (request.getContext().targetChatId !== env.TARGET_CHAT_ID) {
      console.warn(`[Router] Target chat mismatch. Request: ${request.getContext().targetChatId}, Env: ${env.TARGET_CHAT_ID}`);
      return;
    }

    // GUARD: Processed requests are final
    if (request.isProcessed()) {
      await ctx.reply("Request already processed");
      return;
    }

    const text = ctx.message.text.trim();
    const currentState = request.getState();

    // ROUTE: collectingReason
    if (currentState === "collectingReason") {
      const { validateReason } = await import("./utils/validation");

      const validation = validateReason(text);
      if (!validation.success) {
        await ctx.reply(validation.error || "Invalid input");
        return;
      }

      const reason = validation.data!;

      // Update State
      request.submitReason(reason);
      // PERSIST IMMEDIATELY: Ensure reason is saved even if posting to admin group fails
      await joinRequestRepository.save(request);

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
      const adminMsgId = await postReviewCard(ctx.api, reviewCardData);

      const { getMessage } = await import("./templates/messages");

      if (adminMsgId) {
        request.setAdminMsgId(adminMsgId);
        await joinRequestRepository.save(request); // Save adminMsgId

        await ctx.reply(getMessage("thank-you"));
      } else {
        console.error(`[Router] Failed to post review card for user ${userId}`);
        await ctx.reply("Your request has been saved, but we couldn't notify the admins immediately. We will review it shortly.");
      }
      return;
    }

    // ROUTE: awaitingReview
    if (currentState === "awaitingReview") {

      const { validateAdditionalMessage } = await import("./utils/validation");
      const validation = validateAdditionalMessage(text);

      if (!validation.success) {
        // Silent fail or soft warn? Let's warn softly
        await ctx.reply(validation.error || "Message too short/long");
        return;
      }

      const message = validation.data!;

      // Update State
      request.addMessage(message);
      await joinRequestRepository.save(request); // PERSIST IMMEDIATELY

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

          await appendMessageToReviewCard(ctx.api, context.adminMsgId, reviewCardData);
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
