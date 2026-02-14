import { Bot } from "grammy";
import { JoinRequestService } from "./application/services/joinRequestService";
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

  // Message router: only for non-command text so /admin, /pending, /completed, /cleanup are handled below.
  const isNotCommand = (ctx: BotContext) =>
    !ctx.message?.entities?.some((e: { type: string }) => e.type === "bot_command");

  bot.filter(isNotCommand).on("message:text", async (ctx: BotContext) => {
    if (!ctx.chat || !ctx.from || !ctx.message || !ctx.message.text) {
      return;
    }

    if (ctx.chat.type !== "private") {
      return;
    }

    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const service = new JoinRequestService(repo, config, ctx.api);

    const result = await service.handleUserMessage(userId, text);
    if (result.reply) {
      await ctx.reply(result.reply);
    } else if (process.env.NODE_ENV !== "production") {
      logger.info({ userId }, "Ignored message: No active request");
    }
  });

  // Admin commands (/admin, /pending, /completed, /cleanup) and callback buttons.
  registerAdminHandlers(bot);

  // Register other handlers
  registerJoinRequestHandler(bot);
  registerCallbackHandlers(bot);

  return bot;
}
