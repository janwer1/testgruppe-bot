import { Context } from "grammy";

/**
 * Bot context type - plain grammY Context without session
 * All domain state is stored via JoinRequestRepository, not Grammy sessions.
 */
export type BotContext = Context;
