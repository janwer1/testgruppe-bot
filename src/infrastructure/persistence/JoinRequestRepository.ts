import { JoinRequest } from "../../domain/JoinRequest";
import type { JoinRequestContext, JoinRequestInput } from "../../domain/joinRequestMachine";
import type { BotConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import type { RequestState, StateStoreInterface } from "./state";

/**
 * Repository interface for join request persistence
 */
export interface IJoinRequestRepository {
  create(input: JoinRequestInput): Promise<JoinRequest>;
  findById(requestId: string): Promise<JoinRequest | undefined>;
  findByUserId(userId: number): Promise<JoinRequest | undefined>;
  findRecent(limit?: number): Promise<JoinRequest[]>;
  findRecentByStatus(options: { status: "pending" | "completed"; limit?: number }): Promise<JoinRequest[]>;
  save(request: JoinRequest): Promise<void>;
  /** Mark pending requests as declined (stale) without going through the domain. Used for admin cleanup. */
  markPendingAsStaleResolved(requestIds: string[], resolvedBy: string): Promise<number>;
}

/**
 * Repository implementation for domain persistence
 * Handles long-term storage of JoinRequest entities in D1
 */
export class JoinRequestRepository implements IJoinRequestRepository {
  private store: StateStoreInterface;
  private config: BotConfig;

  constructor(store: StateStoreInterface, config: BotConfig) {
    this.store = store;
    this.config = config;
  }

  /**
   * Create a new join request
   */
  async create(input: JoinRequestInput): Promise<JoinRequest> {
    const request = new JoinRequest(input);

    // Link user to this request ID
    await this.store.setUserActiveRequest(input.userId, input.requestId);

    // Add to timeline for admin listing
    await this.store.addToTimeline(input.requestId, input.timestamp);

    // Persist initial state
    await this.save(request);

    this.attachLogger(request);
    return request;
  }

  /**
   * Find request by ID
   */
  async findById(requestId: string): Promise<JoinRequest | undefined> {
    const state = await this.store.get(requestId);
    if (!state) {
      return undefined;
    }

    const context: JoinRequestContext = {
      config: this.config,
      requestId,
      userId: state.userId,
      targetChatId: state.targetChatId,
      displayName: state.displayName,
      username: state.username,
      reason: state.reason,
      additionalMessages: state.additionalMessages,
      adminMsgId: state.adminMsgId,
      timestamp: state.timestamp,
      decision: state.decisionStatus
        ? {
            status: state.decisionStatus,
            adminId: state.decisionAdminId || 0,
            adminName: state.decisionAdminName || "Unknown",
            at: state.decisionAt || state.timestamp,
          }
        : undefined,
    };

    const request = JoinRequest.fromContext(context);
    this.attachLogger(request);
    return request;
  }

  /**
   * Find request by user ID
   */
  async findByUserId(userId: number): Promise<JoinRequest | undefined> {
    const requestId = await this.store.getActiveRequestIdByUserId(userId);
    if (!requestId) {
      return undefined;
    }

    return this.findById(requestId);
  }

  /**
   * Find recent requests with optional status filter
   */
  async findRecentByStatus(options: { status: "pending" | "completed"; limit?: number }): Promise<JoinRequest[]> {
    const limit = options.limit || 10;
    const requestIds = await this.store.getRecentRequests(limit, options.status);
    const requests = await Promise.all(requestIds.map((id) => this.findById(id)));
    return requests.filter((r): r is JoinRequest => r !== undefined);
  }

  /**
   * Find recent requests (global)
   */
  async findRecent(limit: number = 10): Promise<JoinRequest[]> {
    const requestIds = await this.store.getRecentRequests(limit);
    const requests = await Promise.all(requestIds.map((id) => this.findById(id)));
    // Filter out undefined results (in case of expired/missing data)
    return requests.filter((r): r is JoinRequest => r !== undefined);
  }

  /**
   * Mark pending requests as declined (stale). Updates store only; no Telegram API or domain transitions.
   * Returns the number of requests actually marked.
   */
  async markPendingAsStaleResolved(requestIds: string[], resolvedBy: string): Promise<number> {
    let marked = 0;
    const now = Date.now();

    for (const requestId of requestIds) {
      const state = await this.store.get(requestId);
      if (!state || state.decisionStatus) continue;

      await this.store.set(requestId, {
        ...state,
        decisionStatus: "declined",
        decisionAt: now,
        decisionAdminId: 0,
        decisionAdminName: resolvedBy,
      });
      marked += 1;
    }

    return marked;
  }

  /**
   * Save request state
   */
  async save(request: JoinRequest): Promise<void> {
    const context = request.getContext();
    const state = request.getState();

    // Serialize full context
    const requestState: RequestState = {
      targetChatId: context.targetChatId,
      userId: context.userId,
      adminMsgId: context.adminMsgId,
      reason: context.reason,
      displayName: context.displayName,
      username: context.username,
      timestamp: context.timestamp,
      additionalMessages: context.additionalMessages,
      // Include decision details
      decisionStatus: context.decision?.status,
      decisionAdminId: context.decision?.adminId,
      decisionAdminName: context.decision?.adminName,
      decisionAt: context.decision?.at,
    };

    // Save the request entity
    await this.store.set(context.requestId, requestState);

    // Update active request pointer based on state
    if (state === "collectingReason" || state === "awaitingReview") {
      await this.store.setUserActiveRequest(context.userId, context.requestId);
    } else if (state === "approved" || state === "declined") {
      // Clear pointer for finalized requests
      await this.store.clearUserActiveRequest(context.userId);
    }
  }

  private attachLogger(request: JoinRequest): void {
    let previousState = request.getState();
    request.subscribe((snapshot) => {
      const currentState = snapshot.value as string;
      if (currentState !== previousState) {
        logger.info(
          {
            component: "Lifecycle",
            requestId: snapshot.context.requestId,
            userId: snapshot.context.userId,
            from: previousState,
            to: currentState,
          },
          "JoinRequest Lifecycle Transition",
        );
        previousState = currentState;
      }
    });
  }
}
