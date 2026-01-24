import { createActor, Actor } from "xstate";
import { joinRequestMachine } from "./joinRequestMachine";
import type { JoinRequestContext, JoinRequestInput } from "./joinRequestMachine";
import { validateReason, validateAdditionalMessage } from "../utils/validation";

/**
 * Domain model for a join request with XState state machine
 */
export class JoinRequest {
  private actor: Actor<typeof joinRequestMachine>;
  private context!: JoinRequestContext; // Initialized in syncContext()

  constructor(input: JoinRequestInput) {
    this.actor = createActor(joinRequestMachine, {
      input,
    });
    this.actor.start();
    this.syncContext();
  }

  /**
   * Get current state value
   */
  getState(): string {
    return this.actor.getSnapshot().value as string;
  }

  /**
   * Get current context
   */
  getContext(): JoinRequestContext {
    return { ...this.context };
  }

  /**
   * Check if request is in a specific state
   */
  isInState(state: string): boolean {
    return this.getState() === state;
  }

  /**
   * Check if request is processed (approved or declined)
   */
  isProcessed(): boolean {
    return this.context.decision !== undefined;
  }

  /**
   * Start reason collection (transitions from pending to collectingReason)
   */
  startCollection(): void {
    if (this.isInState("pending")) {
      this.actor.send({ type: "START_COLLECTION" });
      this.syncContext();
    }
  }

  /**
   * Submit reason (validates and transitions to awaitingReview)
   */
  submitReason(reason: string): { success: boolean; error?: string } {
    if (!this.isInState("collectingReason")) {
      return { success: false, error: "Request is not in collecting reason state" };
    }

    const validation = validateReason(reason);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }

    try {
      this.actor.send({ type: "SUBMIT_REASON", reason: validation.data! });
      this.syncContext();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Set admin message ID (for review card)
   */
  setAdminMsgId(adminMsgId: number): { success: boolean; error?: string } {
    if (!this.isInState("awaitingReview")) {
      return { success: false, error: "Request is not awaiting review" };
    }

    try {
      this.actor.send({ type: "SET_ADMIN_MSG_ID", adminMsgId });
      this.syncContext();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Add additional message
   */
  addMessage(message: string): { success: boolean; error?: string } {
    if (!this.isInState("awaitingReview")) {
      return { success: false, error: "Request is not awaiting review" };
    }

    const validation = validateAdditionalMessage(message);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }

    try {
      this.actor.send({ type: "ADD_MESSAGE", message: validation.data! });
      this.syncContext();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Approve request
   */
  approve(adminId: number, adminName: string): { success: boolean; error?: string } {
    if (!this.isInState("awaitingReview")) {
      return { success: false, error: "Request is not awaiting review" };
    }

    if (this.isProcessed()) {
      return { success: false, error: "Request has already been processed" };
    }

    try {
      this.actor.send({ type: "APPROVE", adminId, adminName });
      this.syncContext();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Decline request
   */
  decline(adminId: number, adminName: string): { success: boolean; error?: string } {
    if (!this.isInState("awaitingReview")) {
      return { success: false, error: "Request is not awaiting review" };
    }

    if (this.isProcessed()) {
      return { success: false, error: "Request has already been processed" };
    }

    try {
      this.actor.send({ type: "DECLINE", adminId, adminName });
      this.syncContext();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Sync context from actor snapshot
   */
  private syncContext(): void {
    const snapshot = this.actor.getSnapshot();
    this.context = { ...snapshot.context };
  }

  /**
   * Create from persisted context (for restoration from Redis)
   * In a stateless environment, restores the machine to the correct state based on persisted data
   */
  static fromContext(context: JoinRequestContext): JoinRequest {
    // Extract input fields (required for machine creation)
    const input: JoinRequestInput = {
      requestId: context.requestId,
      userId: context.userId,
      targetChatId: context.targetChatId,
      userName: context.userName,
      username: context.username,
      timestamp: context.timestamp,
    };

    const request = new JoinRequest(input);

    // Linear event replay sequence for deterministic restoration
    // 1. Start collection if needed
    if (request.isInState("pending")) {
      request.actor.send({ type: "START_COLLECTION" });
      request.syncContext();
    }

    // 2. Submit reason if exists
    if (context.reason) {
      request.actor.send({ type: "SUBMIT_REASON", reason: context.reason });
      request.syncContext();
    }

    // 3. Set admin message ID if exists
    if (context.adminMsgId !== undefined) {
      request.actor.send({ type: "SET_ADMIN_MSG_ID", adminMsgId: context.adminMsgId });
      request.syncContext();
    }

    // 4. Restore additional messages
    for (const message of context.additionalMessages) {
      request.actor.send({ type: "ADD_MESSAGE", message });
      request.syncContext();
    }

    // 5. Restore decision if exists
    if (context.decision) {
      if (context.decision.status === "approved") {
        request.actor.send({
          type: "APPROVE",
          adminId: context.decision.adminId,
          adminName: context.decision.adminName,
        });
      } else if (context.decision.status === "declined") {
        request.actor.send({
          type: "DECLINE",
          adminId: context.decision.adminId,
          adminName: context.decision.adminName,
        });
      }
      request.syncContext();
    }

    return request;
  }
}
