import type { BotConfig } from "../config";
import { JoinRequest } from "../domain/JoinRequest";
import type { JoinRequestContext, JoinRequestInput } from "../domain/joinRequestMachine";
import type { RequestState, StateStoreInterface } from "../services/state";

/**
 * Repository interface for join request persistence
 */
export interface IJoinRequestRepository {
  create(input: JoinRequestInput): Promise<JoinRequest>;
  findById(requestId: string): Promise<JoinRequest | undefined>;
  findByUserId(userId: number): Promise<JoinRequest | undefined>;
  findRecent(limit?: number): Promise<JoinRequest[]>;
  save(request: JoinRequest): Promise<void>;
}

/**
 * Repository implementation for domain persistence
 * Handles long-term storage of JoinRequest entities in Redis
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
      userName: state.userName,
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

    return JoinRequest.fromContext(context);
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
   * Find recent requests
   */
  async findRecent(limit: number = 10): Promise<JoinRequest[]> {
    const requestIds = await this.store.getRecentRequests(limit);
    const requests = await Promise.all(requestIds.map((id) => this.findById(id)));
    // Filter out undefined results (in case of expired/missing data)
    return requests.filter((r): r is JoinRequest => r !== undefined);
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
      userName: context.userName,
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
}
