import { Context, SessionFlavor } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";

/**
 * Session data stored by Grammy's session middleware (via Redis)
 * Only contains minimal metadata - pointers to domain entities
 * Full domain state is stored separately via Repository
 */
export interface SessionData {
  requestId?: string; // Pointer to JoinRequest domain entity
  requestingUserId?: number; // User ID for convenience
  targetChatId?: number; // Target chat ID for convenience
  // Note: reason, adminMsgId, decision, etc. are stored in the domain entity, not session
}

export type BotContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor<Context & SessionFlavor<SessionData>>;
