import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { BotContext, SessionData } from "./types";
import { collectReasonConversation } from "./conversations/collectReason";
import { registerJoinRequestHandler } from "./handlers/joinRequest";
import { registerCallbackHandlers } from "./handlers/callbacks";
import { joinRequestRepository } from "./repositories/JoinRequestRepository";
import { env } from "./env";
import { sessionStorage } from "./services/sessionStorage";

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  // Session middleware with Redis storage (stateless for Vercel)
  // User sessions are stored separately from domain entities
  // Session only contains minimal metadata (requestId pointer)
  // Reference: https://grammy.dev/ref/core/session
  bot.use(
    session({
      initial: (): SessionData => ({}), // Required: prevents ctx.session from being undefined
      storage: sessionStorage, // Uses custom Redis adapter compatible with @grammyjs/storage-redis
      // Per-user sessions: use user ID as session key for all event types
      // For chat_join_request, ctx.chatId is the group ID, not the user's DM
      // For messages, ctx.chat.id is the user's DM chat ID (same as user ID in Telegram)
      // Using ctx.from?.id ensures consistent session key across all event types
      getSessionKey: (ctx) => {
        // Use user ID for per-user sessions (works for both chat_join_request and messages)
        // CRITICAL: When conversations middleware creates a new context, ctx.from might not be set
        // but ctx.chat.id will be available (user's DM chat ID = user ID in Telegram)
        // Priority order:
        // 1. ctx.from.id (available in most updates)
        // 2. ctx.chat.id for private chats (fallback when ctx.from is missing, e.g., in conversation contexts)
        // 3. ctx.chatJoinRequest.from.id (for join request events)
        
        // Log all attempts to help debug
        if (env.MODE === "dev") {
          console.log(`[Session] getSessionKey called: ctx.from=${ctx.from?.id}, ctx.chat=${ctx.chat?.id} (${ctx.chat?.type}), chatJoinRequest=${ctx.chatJoinRequest?.from.id}`);
        }
        
        if (ctx.from?.id) {
          const key = String(ctx.from.id);
          if (env.MODE === "dev") {
            console.log(`[Session] getSessionKey: using ctx.from.id = ${key}`);
          }
          return key;
        }
        // CRITICAL FALLBACK: For private chats, ctx.chat.id equals the user ID
        // This is essential for conversation contexts where ctx.from might not be set
        // Grammy's conversations middleware may call getSessionKey with a context that only has ctx.chat
        if (ctx.chat?.type === "private" && ctx.chat.id) {
          const key = String(ctx.chat.id);
          if (env.MODE === "dev") {
            console.log(`[Session] getSessionKey: using ctx.chat.id (private) = ${key} [FALLBACK - ctx.from not available]`);
          }
          return key;
        }
        // For chat_join_request, use the user from the join request
        if (ctx.chatJoinRequest?.from.id) {
          const key = String(ctx.chatJoinRequest.from.id);
          if (env.MODE === "dev") {
            console.log(`[Session] getSessionKey: using ctx.chatJoinRequest.from.id = ${key}`);
          }
          return key;
        }
        // If no user ID can be determined, log and return undefined (session won't be initialized)
        // This should rarely happen - most updates have ctx.from, ctx.chat (for private), or ctx.chatJoinRequest
        if (env.MODE === "dev") {
          console.warn(`[Session] Could not determine session key for update. ctx.from: ${ctx.from?.id}, ctx.chat: ${ctx.chat?.id} (${ctx.chat?.type}), chatJoinRequest: ${ctx.chatJoinRequest?.from.id}`);
          console.warn(`[Session] Update type: ${ctx.update?.update_id}, available keys: ${Object.keys(ctx.update || {}).join(", ")}`);
        }
        return undefined;
      },
    })
  );

  // Conversations middleware (requires session)
  // This MUST run before any handlers that might enter conversations
  // Grammy's middleware automatically routes messages to active conversations FIRST
  bot.use(conversations());

  // Register conversation FIRST so it's available when we try to restore
  bot.use(createConversation(collectReasonConversation, "collectReason"));

  // Handle messages from users with pending join requests (restore conversations from Redis)
  // This runs AFTER conversation registration so we can enter it
  // IMPORTANT: Grammy's conversations middleware runs FIRST and routes messages to conversations in Redis
  // In a stateless environment, each request is independent - we check Redis session storage, not local state
  // If a conversation exists in Redis, Grammy's middleware routes the message and this handler won't run
  bot.use(async (ctx: BotContext, next) => {
    // Only process text messages
    if (!ctx.message || !("text" in ctx.message)) {
      return next();
    }

    const userId = ctx.from?.id;
    if (!userId) return next();

    // If we reach here, Grammy's conversations middleware didn't route the message
    // This means no conversation exists in Redis session storage for this user
    // In a stateless environment, each request is independent - we check Redis, not local state
    
    // Check if request exists in Redis (fully stateless - no local state assumptions)
    try {
      const request = await joinRequestRepository.findByUserId(userId);
      
      if (request) {
        const context = request.getContext();
        
        // Set session data (Grammy's session middleware will persist to Redis automatically)
        // Session only stores pointers to domain entities
        // Grammy's session middleware initializes ctx.session based on ctx.chatId
        // If session is undefined, it means getSessionKey returned undefined (shouldn't happen for messages)
        if (!ctx.session) {
          console.error(`[Message Handler] Session not initialized for user ${userId}, chatId: ${ctx.chat?.id}`);
          return next();
        }
        
        ctx.session.requestId = context.requestId;
        ctx.session.requestingUserId = context.userId;
        ctx.session.targetChatId = context.targetChatId;
        
        // Try to enter conversation (will create new conversation in Redis if none exists)
        // Grammy's conversations middleware manages conversation state in Redis session storage
        try {
          await ctx.conversation.enter("collectReason");
          console.log(`[Message Handler] Successfully entered conversation for user ${userId}`);
          // Conversation will handle the message, don't call next()
          return;
        } catch (error: any) {
          // If conversation already exists in Redis, Grammy's middleware should have routed it
          // But if we're here, something went wrong - log and let middleware handle it
          const errorMessage = String(error?.message || error || "").toLowerCase();
          const errorString = String(error || "").toLowerCase();
          if (
            errorMessage.includes("already active") ||
            errorMessage.includes("conversation") ||
            errorMessage.includes("already running") ||
            errorString.includes("already active") ||
            errorString.includes("conversation") ||
            errorString.includes("already running")
          ) {
            // Conversation exists in Redis - Grammy's middleware should have routed it
            // Pass through and let middleware handle it
            return next();
          }
          // For other errors, log and let middleware try to handle it
          console.error(`[Message Handler] Error entering conversation for user ${userId}:`, {
            message: error?.message,
            error: String(error),
            errorType: error?.constructor?.name,
          });
          return next();
        }
      } else {
        // No request found - user might be messaging after their request expired/was cleared
        // Send helpful message with join link if available
        console.log(`[Message Handler] No request found for user ${userId}, sending helpful message`);
        try {
          let message = "I don't have an active join request for you. ";
          if (env.JOIN_LINK) {
            message += `Please request to join again using this link: ${env.JOIN_LINK}`;
          } else {
            message += "Please request to join the channel/group again.";
          }
          await ctx.api.sendMessage(userId, message);
        } catch (error) {
          console.error(`[Message Handler] Failed to send message to user ${userId}:`, error);
        }
        // Don't process the message further
        return;
      }
    } catch (error) {
      console.error(`[Message Handler] Error checking request for user ${userId}:`, error);
    }

    return next();
  });

  // Debug: Log all incoming messages (only in dev mode)
  if (env.MODE === "dev") {
    bot.on("message", async (ctx) => {
      console.log(`[Debug] Received message from user ${ctx.from?.id} in chat ${ctx.chat.id}: ${ctx.message?.text?.substring(0, 50) || "non-text"}`);
      // Check if conversation is active for this user
      try {
        // This is just for debugging - we can't directly check, but we can log
        console.log(`[Debug] Message handler will check for active conversation`);
      } catch (e) {
        // Ignore
      }
    });
  }

  // Register handlers
  registerJoinRequestHandler(bot);
  registerCallbackHandlers(bot);

  return bot;
}
