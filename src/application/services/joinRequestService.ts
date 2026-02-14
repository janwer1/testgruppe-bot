import { ulid } from "@std/ulid";
import type { Api, Bot } from "grammy";
import type { JoinRequest } from "../../domain/JoinRequest";
import type { JoinRequestInput } from "../../domain/joinRequestMachine";
import type { IJoinRequestRepository } from "../../infrastructure/persistence/JoinRequestRepository";
import type { BotConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import { getMessage } from "../../templates/messages";
import { isAdminInBothChats } from "./authz";
import { appendMessageToReviewCard, postReviewCard, updateReviewCard } from "./reviewCard";

// biome-ignore lint/suspicious/noExplicitAny: consistent with authz.ts
function resolveApi(api: Api | { api: Api } | any): Api {
  if (api && typeof api.sendMessage === "function") {
    return api as Api;
  }
  if (api?.api && typeof api.api.sendMessage === "function") {
    return api.api as Api;
  }
  throw new TypeError("Invalid API instance");
}

export type AdminAction = "approve" | "decline";

export class JoinRequestService {
  constructor(
    private repo: IJoinRequestRepository,
    private config: BotConfig,
    // biome-ignore lint/suspicious/noExplicitAny: context-agnostic bot
    private botOrApi: Api | Bot<any> | any,
  ) {}

  async initializeRequest(
    user: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    },
    targetChatId: number,
    userChatId?: number,
  ): Promise<void> {
    const userId = user.id;
    const requestId = ulid();
    const displayName = `${user.first_name || ""}${user.last_name ? ` ${user.last_name}` : ""}`.trim() || "User";

    logger.info({ component: "JoinRequest", userId, requestId, targetChatId }, "Join Request Received");

    const input: JoinRequestInput = {
      config: this.config,
      requestId,
      userId,
      targetChatId,
      displayName,
      username: user.username,
      timestamp: Date.now(),
    };

    const request = await this.repo.create(input);
    request.startCollection();
    await this.repo.save(request);

    const recipientId = userChatId || userId;

    try {
      const apiInstance = resolveApi(this.botOrApi);
      await apiInstance.sendMessage(
        recipientId,
        getMessage("welcome", { minWords: this.config.minReasonWords, maxChars: this.config.maxReasonChars }),
      );
    } catch (dmError) {
      logger.error({ component: "JoinRequest", err: dmError, userId }, "Failed to send DM to user");

      const failureReason = getMessage("dm-failed");
      const reviewCardData = this.buildReviewCardData(request, failureReason);
      const adminMsgId = await postReviewCard(this.botOrApi, reviewCardData, this.config);

      if (adminMsgId) {
        request.submitReason(failureReason);
        request.setAdminMsgId(adminMsgId);
        await this.repo.save(request);
      }
    }
  }

  async handleUserMessage(userId: number, text: string): Promise<{ reply?: string }> {
    const request = await this.repo.findByUserId(userId);
    if (!request) {
      return {};
    }

    const context = request.getContext();
    if (context.userId !== userId || context.targetChatId !== this.config.targetChatId) {
      logger.warn(
        { userId, requestUserId: context.userId, requestTargetChatId: context.targetChatId },
        "Request mismatch",
      );
      return {};
    }

    if (request.isProcessed()) {
      return { reply: "Request already processed" };
    }

    const state = request.getState();

    if (state === "collectingReason") {
      const result = request.submitReason(text);
      if (!result.success) {
        return { reply: result.error?.message || getMessage("invalid-input") };
      }

      await this.repo.save(request);

      const reviewCardData = this.buildReviewCardData(request, result.success ? text : "");
      const adminMsgId = await postReviewCard(this.botOrApi, reviewCardData, this.config);

      if (adminMsgId) {
        request.setAdminMsgId(adminMsgId);
        await this.repo.save(request);
        return { reply: getMessage("thank-you") };
      }

      return {
        reply: "Your request has been saved, but we couldn't notify the admins immediately. We will review it shortly.",
      };
    }

    if (state === "awaitingReview") {
      const result = request.addMessage(text);
      if (!result.success) {
        return {
          reply: result.error?.message || getMessage("message-too-long", { maxChars: this.config.maxReasonChars }),
        };
      }

      await this.repo.save(request);

      const updatedData = this.buildReviewCardData(request, request.getContext().reason || "");
      const adminMsgId = request.getContext().adminMsgId;
      if (adminMsgId !== undefined) {
        await appendMessageToReviewCard(this.botOrApi, adminMsgId, updatedData, this.config);
      }

      return { reply: getMessage("msg-added") };
    }

    return {};
  }

  async handleAdminAction(
    requestId: string,
    adminId: number,
    adminName: string,
    action: AdminAction,
  ): Promise<{ ok: boolean; message: string; alreadyHandled?: boolean }> {
    const request = await this.repo.findById(requestId);
    if (!request) {
      return { ok: false, message: getMessage("request-not-found") };
    }

    if (request.isProcessed()) {
      return { ok: true, message: getMessage("request-processed"), alreadyHandled: true };
    }

    const isAuthorized = await isAdminInBothChats(this.botOrApi, adminId, this.config);
    if (!isAuthorized) {
      return { ok: false, message: getMessage("not-authorized") };
    }

    const context = request.getContext();

    try {
      const apiInstance = resolveApi(this.botOrApi);
      let userIsAlreadyApproved = false;
      let userIsAlreadyDeclined = false;

      if (action === "approve") {
        try {
          await apiInstance.approveChatJoinRequest(context.targetChatId, context.userId);
        } catch (apiError: unknown) {
          const error = apiError as { description?: string };
          if (
            error.description?.includes("USER_ALREADY_PARTICIPANT") ||
            error.description?.includes("HIDE_REQUESTER_MISSING")
          ) {
            logger.info(
              { component: "JoinRequestService", userId: context.userId },
              "Approve: already participant or request missing",
            );
            userIsAlreadyApproved = true;
          } else {
            throw apiError;
          }
        }
        const approveResult = request.approve(adminId, adminName);
        if (!approveResult.success) {
          return { ok: false, message: approveResult.error?.message || "Failed to approve request" };
        }
      } else {
        try {
          await apiInstance.declineChatJoinRequest(context.targetChatId, context.userId);
        } catch (apiError: unknown) {
          const error = apiError as { description?: string };
          if (
            error.description?.includes("USER_NOT_PARTICIPANT") ||
            error.description?.includes("user not found") ||
            error.description?.includes("HIDE_REQUESTER_MISSING")
          ) {
            logger.info(
              { component: "JoinRequestService", userId: context.userId },
              "Decline: user not participant or request missing",
            );
            userIsAlreadyDeclined = true;
          } else {
            throw apiError;
          }
        }
        const declineResult = request.decline(adminId, adminName);
        if (!declineResult.success) {
          return { ok: false, message: declineResult.error?.message || "Failed to decline request" };
        }
      }

      await this.repo.save(request);

      try {
        if (action === "approve") {
          await apiInstance.sendMessage(context.userId, getMessage("approved-user"));
          await apiInstance.sendMessage(context.userId, getMessage("approved-user-intro"));
        } else {
          await apiInstance.sendMessage(context.userId, getMessage("declined-user"));
        }
      } catch (userError) {
        logger.error(
          { component: "JoinRequestService", err: userError, userId: context.userId },
          "Failed to notify user",
        );
      }

      if (context.adminMsgId) {
        await updateReviewCard(
          this.botOrApi,
          context.adminMsgId,
          action === "approve" ? "approved" : "declined",
          adminName,
          this.buildReviewCardData(request, context.reason || ""),
          this.config,
        );
      }

      return {
        ok: true,
        message:
          action === "approve"
            ? getMessage(userIsAlreadyApproved ? "already-approved" : "action-success-approved")
            : getMessage(userIsAlreadyDeclined ? "already-declined" : "action-success-declined"),
      };
    } catch (error) {
      logger.error({ err: error, requestId, action }, "Admin action failed");
      return {
        ok: false,
        message: action === "approve" ? getMessage("error-approving") : getMessage("error-declining"),
      };
    }
  }

  private buildReviewCardData(
    request: JoinRequest,
    reason: string,
  ): {
    userId: number;
    displayName: string;
    username?: string;
    reason: string;
    timestamp: Date;
    requestId: string;
    additionalMessages?: string[];
  } {
    const context = request.getContext();
    return {
      userId: context.userId,
      displayName: context.displayName,
      username: context.username,
      reason,
      timestamp: new Date(context.timestamp),
      requestId: context.requestId,
      additionalMessages: context.additionalMessages,
    };
  }
}
