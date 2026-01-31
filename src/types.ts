import type { Context } from "grammy";
import type { IJoinRequestRepository } from "./infrastructure/persistence/JoinRequestRepository";
import type { BotConfig } from "./shared/config";

/**
 * Bot context type - plain grammY Context without session
 * All domain state is stored via JoinRequestRepository, not Grammy sessions.
 */
export type BotContext = Context & {
  config: BotConfig;
  repo: IJoinRequestRepository;
};
