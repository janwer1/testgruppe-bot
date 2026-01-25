import { JoinRequest } from "../domain/JoinRequest";
import type { JoinRequestContext, JoinRequestInput } from "../domain/joinRequestMachine";
import { stateStore, RequestState } from "../services/state";

/**
 * Repository interface for join request persistence
 */
export interface IJoinRequestRepository {
  create(input: JoinRequestInput): Promise<JoinRequest>;
  findById(requestId: string): Promise<JoinRequest | undefined>;
  findByUserId(userId: number): Promise<JoinRequest | undefined>;
  save(request: JoinRequest): Promise<void>;
}

/**
 * Repository implementation for domain persistence
 * Handles long-term storage of JoinRequest entities in Redis
 */
export class JoinRequestRepository implements IJoinRequestRepository {
  /**
   * Create a new join request
   * Sets up the user -> requestId pointer for domain lookup
   */
  async create(input: JoinRequestInput): Promise<JoinRequest> {
    const request = new JoinRequest(input);

    // Set user active request pointer (domain persistence)
    await stateStore.setUserActiveRequest(input.userId, input.requestId);

    // Save initial state (will be in "pending" state)
    await this.save(request);

    return request;
  }

  /**
   * Find request by ID
   */
  async findById(requestId: string): Promise<JoinRequest | undefined> {
    const state = await stateStore.get(requestId);
    if (!state) {
      return undefined;
    }

    const context: JoinRequestContext = {
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
   * Uses simple pointer lookup: user:${userId}:activeRequest -> requestId
   */
  async findByUserId(userId: number): Promise<JoinRequest | undefined> {
    // Get active request ID pointer for this user (domain persistence)
    const requestId = await stateStore.getActiveRequestIdByUserId(userId);
    if (!requestId) {
      return undefined;
    }

    // Load the full request entity by ID
    return this.findById(requestId);
  }

  /**
   * Save request state (domain persistence)
   * Serializes the full context including decision object with adminId/adminName
   * Manages user -> requestId pointer for domain lookup
   */
  async save(request: JoinRequest): Promise<void> {
    const context = request.getContext();
    const state = request.getState();

    // Serialize full context to RequestState (includes decision object)
    const requestState: RequestState = {
      targetChatId: context.targetChatId,
      userId: context.userId,
      adminMsgId: context.adminMsgId,
      reason: context.reason,
      userName: context.userName,
      username: context.username,
      timestamp: context.timestamp,
      additionalMessages: context.additionalMessages,
      // Persist decision object with adminId and adminName (never lose audit data)
      decisionStatus: context.decision?.status,
      decisionAdminId: context.decision?.adminId,
      decisionAdminName: context.decision?.adminName,
      decisionAt: context.decision?.at,
    };

    // Save the request entity
    await stateStore.set(context.requestId, requestState);

    // Manage user -> requestId pointer for domain lookup
    // This is domain persistence (request state and user pointer in Redis)
    if (state === "collectingReason" || state === "awaitingReview") {
      // Keep pointer for active requests
      await stateStore.setUserActiveRequest(context.userId, context.requestId);
    } else if (state === "approved" || state === "declined") {
      // Clear pointer when request is finalized (markProcessed equivalent)
      await stateStore.clearUserActiveRequest(context.userId);
    }
  }
}

// Export singleton instance
export const joinRequestRepository = new JoinRequestRepository();
