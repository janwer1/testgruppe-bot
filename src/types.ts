import type { Context } from "grammy";
import type { BotConfig } from "./config";
import type { IJoinRequestRepository } from "./repositories/JoinRequestRepository";

/**
 * Bot context type - plain grammY Context without session
 * All domain state is stored via JoinRequestRepository, not Grammy sessions.
 */
export type BotContext = Context & {
  config: BotConfig;
  repo: IJoinRequestRepository;
};
