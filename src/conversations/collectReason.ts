import { Conversation, ConversationFlavor } from "@grammyjs/conversations";
import { BotContext, SessionData } from "../types";
import { postReviewCard, ReviewCardData } from "../services/reviewCard";
import { joinRequestRepository } from "../repositories/JoinRequestRepository";
import { validateReason, validateAdditionalMessage } from "../utils/validation";
import type { JoinRequestInput } from "../domain/joinRequestMachine";

import { env } from "../env";

const INVALID_INPUT_MESSAGE = "Please send a text message with your reason.";

const THANK_YOU_MESSAGE =
  "Thank you! Your application has been submitted for review.";

/**
 * Send a message to the user as a DM
 * Handles both group chat context (from chat_join_request) and private chat context
 */
async function sendDM(ctx: BotContext, userId: number, message: string): Promise<void> {
  // If we're in a private chat, use ctx.reply
  if (ctx.chat?.type === "private") {
    await ctx.reply(message);
    return;
  }

  // Otherwise, send as DM to the user
  await ctx.api.sendMessage(userId, message);
}

/**
 * Collect initial reason from user
 * Simplified: always ask and wait for message
 */
async function collectInitialReason(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  request: any // JoinRequest
): Promise<{ success: boolean; reason?: string; error?: string }> {
  let attempts = 0;
  const maxAttempts = 3;
  const userId = request.getContext().userId;

  console.log(`[Conversation] collectInitialReason: request state is ${request.getState()}`);

  while (attempts < maxAttempts) {
    // Always ask for reason - send as DM to user
    console.log(`[Conversation] Sending welcome message (attempt ${attempts + 1}/${maxAttempts})...`);
    await sendDM(ctx, userId, "Welcome! To complete your request, please reply with a short reason why you want to join.");

    try {
      console.log(`[Conversation] Waiting for message:text...`);
      const responseCtx = await conversation.waitFor("message:text") as BotContext;
      console.log(`[Conversation] Received message from user ${responseCtx.from?.id}, text length: ${responseCtx.message?.text?.length || 0}`);

      if (!responseCtx.message || !("text" in responseCtx.message) || !responseCtx.message.text) {
        attempts++;
        if (attempts < maxAttempts) {
          await sendDM(responseCtx, userId, INVALID_INPUT_MESSAGE);
        } else {
          await sendDM(responseCtx, userId, "Sorry, I didn't receive a valid text message. Please try requesting to join again.");
          return { success: false, error: "No valid text message received" };
        }
        continue;
      }

      const rawReason = responseCtx.message.text.trim();

      // Validate reason using Zod
      const reasonValidation = validateReason(rawReason);
      if (!reasonValidation.success) {
        attempts++;
        if (attempts < maxAttempts) {
          await sendDM(responseCtx, userId, reasonValidation.error || "Please provide a valid reason.");
        } else {
          await sendDM(responseCtx, userId, "Sorry, I didn't receive a valid reason. Please try requesting to join again.");
          return { success: false, error: reasonValidation.error };
        }
        continue;
      }

      const reason = reasonValidation.data!;

      // Submit reason to the request
      const submitResult = request.submitReason(reason);
      if (!submitResult.success) {
        await sendDM(responseCtx, userId, submitResult.error || "Error processing your reason. Please try again.");
        return { success: false, error: submitResult.error };
      }

      // Save request state
      await joinRequestRepository.save(request);

      return { success: true, reason };
    } catch (error) {
      console.error(`[Conversation] Error waiting for message:`, error);
      attempts++;
      if (attempts >= maxAttempts) {
        return { success: false, error: "Max attempts reached" };
      }
    }
  }

  return { success: false, error: "Max attempts reached" };
}

/**
 * Handle additional messages from user after initial reason
 */
async function handleAdditionalMessages(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  request: any, // JoinRequest
  adminMsgId: number
): Promise<void> {
  console.log(`[Conversation] Review card posted, now listening for additional messages...`);

  // Get user ID from request context (needed for sending DMs)
  const userId = request.getContext().userId;

  while (true) {
    try {
      const additionalCtx = await conversation.waitFor("message:text") as BotContext;
      const rawAdditionalText = additionalCtx.message?.text?.trim();

      if (!rawAdditionalText) {
        continue;
      }

      // Validate additional message
      const messageValidation = validateAdditionalMessage(rawAdditionalText);
      if (!messageValidation.success) {
        await sendDM(additionalCtx, userId, messageValidation.error || "Ungültige Nachricht. Bitte versuchen Sie es erneut.");
        continue;
      }

      const additionalText = messageValidation.data!;
      console.log(`[Conversation] Received additional message: ${additionalText.substring(0, 50)}`);

      // Check if request is still active
      if (request.isProcessed()) {
        await sendDM(additionalCtx, userId, "Diese Anfrage wurde bereits bearbeitet.");
        return;
      }

      // Add message to request
      const addResult = request.addMessage(additionalText);
      if (!addResult.success) {
        await sendDM(additionalCtx, userId, addResult.error || "Fehler beim Hinzufügen der Nachricht.");
        continue;
      }

      // Save updated request
      await joinRequestRepository.save(request);

      // Get updated context for review card
      const context = request.getContext();
      const reviewCardData: ReviewCardData = {
        userId: context.userId,
        userName: context.userName,
        username: context.username,
        reason: context.reason || "",
        timestamp: new Date(context.timestamp),
        requestId: context.requestId,
        additionalMessages: context.additionalMessages,
      };

      // Append message to review card
      const { appendMessageToReviewCard } = await import("../services/reviewCard");
      await appendMessageToReviewCard(
        additionalCtx.api,
        adminMsgId,
        reviewCardData
      );

      await sendDM(additionalCtx, userId, "Nachricht hinzugefügt. Die Admins wurden benachrichtigt.");
    } catch (error) {
      console.error(`[Conversation] Error handling additional message:`, error);
      // If conversation ends or errors, exit
      return;
    }
  }
}

/**
 * Main conversation function
 */
export async function collectReasonConversation(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext
): Promise<void> {
  console.log(`[Conversation] Started collectReason for user ${ctx.from?.id}, chatId: ${ctx.chat?.id}, chatType: ${ctx.chat?.type}`);

  const userId = ctx.from?.id;
  if (!userId) {
    console.error(`[Conversation] No user ID in context. ctx.from: ${ctx.from}, ctx.chat: ${ctx.chat?.id} (${ctx.chat?.type})`);
    return;
  }

  // Log session state for debugging
  if (env.MODE === "dev") {
    console.log(`[Conversation] Session state: ${ctx.session ? "initialized" : "undefined"}, session keys: ${ctx.session ? Object.keys(ctx.session).join(", ") : "none"}`);
  }

  // Find request using repository (domain entity lookup)
  // Grammy's session middleware handles conversation state persistence automatically
  const request = await joinRequestRepository.findByUserId(userId);
  if (!request) {
    console.error(`[Conversation] No request found for user ${userId}`);

    // If session has requestId but entity not found, domain entity may have expired
    if (ctx.session?.requestId) {
      console.warn(`[Conversation] Session has requestId ${ctx.session.requestId} but domain entity not found. Entity may have expired.`);
    }

    // Don't send another error message - the message handler already sent "I don't have an active join request for you..."
    // if no request was found. Just return silently to avoid duplicate error messages.
    return;
  }

  const context = request.getContext();
  const currentState = request.getState();
  console.log(`[Conversation] Found request ${context.requestId} in state: ${currentState}`);

  // Ensure session has the requestId pointer (Grammy's session middleware handles persistence)
  // Session should always be initialized by Grammy's middleware (based on getSessionKey)
  // If session is undefined, it means getSessionKey returned undefined when the session middleware ran
  // This can happen when Grammy's conversations middleware creates a new context that doesn't have ctx.from set
  // Workaround: Manually load session from storage if it's not initialized
  // This is a workaround for a Grammy issue where session isn't initialized in conversation context
  if (!ctx.session) {
    console.error(`[Conversation] Session not initialized for user ${userId}, chatId: ${ctx.chat?.id}, ctx.from: ${ctx.from?.id}, chatType: ${ctx.chat?.type}`);
    console.error(`[Conversation] This means getSessionKey returned undefined when session middleware ran on conversation context.`);
    console.error(`[Conversation] Attempting to work around by manually loading session from storage...`);

    // Workaround: Manually load session from storage and assign to ctx.session
    // This handles the case where Grammy's conversations middleware creates a context
    // where getSessionKey returns undefined even though we have ctx.chat.id
    if (userId) {
      const { sessionStorage } = await import("../services/sessionStorage");
      const sessionKey = String(userId);
      let session: SessionData;

      const existingSession = await sessionStorage.read(sessionKey);
      if (existingSession) {
        session = existingSession;
        console.log(`[Conversation] Manually loaded session from storage for user ${userId}, session keys: ${Object.keys(existingSession).join(", ")}`);
      } else {
        // No session in storage - create a new one
        session = {};
        await sessionStorage.write(sessionKey, session);
        console.log(`[Conversation] Manually created new session for user ${userId}`);
      }

      // Assign session using Object.defineProperty to ensure it persists
      // Grammy might be using a getter/setter, so we need to set it properly
      Object.defineProperty(ctx, "session", {
        value: session,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      // Verify the assignment worked
      if (!ctx.session) {
        console.error(`[Conversation] Failed to assign session - ctx.session is still undefined after assignment!`);
        return;
      }
      console.log(`[Conversation] Successfully assigned session, verified: ${ctx.session ? "yes" : "no"}`);
    } else {
      // Can't initialize without user ID - return silently
      console.error(`[Conversation] Cannot initialize session without user ID`);
      return;
    }
  }

  // Now we can safely access ctx.session
  ctx.session.requestId = context.requestId;
  ctx.session.requestingUserId = context.userId;
  ctx.session.targetChatId = context.targetChatId;

  // If we already have a reason, we're handling additional messages
  if (context.reason && request.isInState("awaitingReview")) {
    const adminMsgId = context.adminMsgId;
    if (!adminMsgId) {
      console.error(`[Conversation] Request has reason but no adminMsgId`);
      try {
        await ctx.api.sendMessage(context.userId, "Error: Request state is invalid. Please try requesting to join again.");
      } catch (error) {
        console.error(`[Conversation] Failed to send error message:`, error);
      }
      return;
    }

    // Handle additional messages
    await handleAdditionalMessages(conversation, ctx, request, adminMsgId);
    return;
  }

  // Check if we're in collectingReason state (should collect initial reason)
  if (currentState === "collectingReason") {
    console.log(`[Conversation] Request is in collectingReason state, collecting initial reason...`);
  } else if (currentState !== "pending") {
    console.warn(`[Conversation] Unexpected state: ${currentState}, attempting to collect reason anyway`);
  }

  // Collect initial reason
  console.log(`[Conversation] Calling collectInitialReason...`);
  const result = await collectInitialReason(conversation, ctx, request);
  if (!result.success || !result.reason) {
    return;
  }

  // Get user info for review card
  const user = ctx.from;
  if (!user) {
    try {
      await ctx.api.sendMessage(context.userId, "Error: Could not identify user. Please try requesting to join again.");
    } catch (error) {
      console.error(`[Conversation] Failed to send error message:`, error);
    }
    return;
  }

  const userName = `${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}`;

  // Post review card to admin group
  const reviewCardData: ReviewCardData = {
    userId: context.userId,
    userName,
    username: user.username,
    reason: result.reason,
    timestamp: new Date(context.timestamp),
    requestId: context.requestId,
    additionalMessages: [],
  };

  console.log(`[Conversation] Posting review card to admin group...`);
  const adminMsgId = await postReviewCard(ctx.api, reviewCardData);

  if (adminMsgId) {
    console.log(`[Conversation] Review card posted successfully with message ID: ${adminMsgId}`);

    // Set admin message ID via domain model (sends SET_ADMIN_MSG_ID event to machine)
    // All state mutations go through the machine - no manual patching
    const setResult = request.setAdminMsgId(adminMsgId);
    if (!setResult.success) {
      console.error(`[Conversation] Failed to set adminMsgId: ${setResult.error}`);
      await sendDM(ctx, context.userId, "Error saving your application. Please try requesting to join again.");
      return;
    }

    // Persist domain entity (machine state is now updated)
    await joinRequestRepository.save(request);

    await sendDM(ctx, context.userId, THANK_YOU_MESSAGE);

    // Continue listening for additional messages
    await handleAdditionalMessages(conversation, ctx, request, adminMsgId);
  } else {
    await sendDM(ctx, context.userId, "Error posting your application. Please try requesting to join again.");
  }
}
