import { Bot } from "grammy";
import { BotContext } from "./types";
import { registerJoinRequestHandler } from "./handlers/joinRequest";
import { registerCallbackHandlers } from "./handlers/callbacks";
import { joinRequestRepository } from "./repositories/JoinRequestRepository";
import { env } from "./env";

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  // NOTE: Session middleware removed - it was unused.
  // The stateless router loads all state from JoinRequestRepository.findByUserId()
  // No need for Grammy sessions when domain state is fully persisted in Redis.

  // Stateless Message Router
  // Handles all user input without maintaining local conversation state
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

    // Load fresh state from Redis
    // "Trust no one, load everything"
    const request = await joinRequestRepository.findByUserId(userId);

    if (!request) {
      // No active request found
      // Optional: check if they are sending a command or just chatting
      // For now, we remain silent or send a help message if needed
      // But to avoid spam, we'll just ignore or log in dev
      if (env.MODE === "dev") {
        console.log(`[Router] Ignored message from ${userId}: No active request`);
      }
      return;
    }

    // GUARD: Strict User ID matching (Should be guaranteed by findByUserId but good for safety)
    if (request.getContext().userId !== userId) {
      console.error(`[Router] Security Mismatch! Loaded request for ${request.getContext().userId} but msg from ${userId}`);
      return;
    }

    // GUARD: Ensure request matches current configured target chat
    // Prevents interaction with old requests from different deployments/configs
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
      // Cutoff check strictly via isProcessed (already checked above, but valid re-check if logic changes)
      if (request.isProcessed()) {
        await ctx.reply("Request already processed");
        return;
      }

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

  // Debug: Log private text messages only (in dev mode)
  // Avoids noisy logs from supergroup messages
  if (env.MODE === "dev") {
    bot.on("message:text", async (ctx: BotContext) => {
      if (!ctx.chat || ctx.chat.type !== "private") return;
      console.log(`[Debug] Private DM from ${ctx.from?.id}: ${ctx.message?.text?.substring(0, 50)}`);
    });
  }

  // Register handlers
  registerJoinRequestHandler(bot);
  registerCallbackHandlers(bot);

  return bot;
}
