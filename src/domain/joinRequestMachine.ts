import { setup, assign } from "xstate";
import { env } from "../env";

// Machine context type - exported for use in repository
export interface JoinRequestContext {
  requestId: string;
  userId: number;
  targetChatId: number;
  userName: string;
  username?: string;
  reason?: string;
  additionalMessages: string[]; // Always initialized, never optional
  adminMsgId?: number;
  timestamp: number;
  decision?: {
    status: "approved" | "declined";
    adminId: number; // Store admin ID for auditability
    adminName: string;
    at: number;
  };
}

// Machine input type (what's required to create a machine instance)
export type JoinRequestInput = Omit<
  JoinRequestContext,
  "reason" | "additionalMessages" | "adminMsgId" | "decision"
>;

// Machine events
export type JoinRequestEvent =
  | { type: "START_COLLECTION" }
  | { type: "SUBMIT_REASON"; reason: string }
  | { type: "SET_ADMIN_MSG_ID"; adminMsgId: number }
  | { type: "ADD_MESSAGE"; message: string }
  | { type: "APPROVE"; adminId: number; adminName: string }
  | { type: "DECLINE"; adminId: number; adminName: string };

// Create the state machine
export const joinRequestMachine = setup({
  types: {
    input: {} as JoinRequestInput,
    context: {} as JoinRequestContext,
    events: {} as JoinRequestEvent,
  },
  guards: {
    isValidReason: ({ event }) => {
      if (event.type !== "SUBMIT_REASON") return false;
      const reason = event.reason.trim();
      return reason.length > 0 && reason.length <= env.MAX_REASON_LENGTH;
    },
    isValidMessage: ({ event }) => {
      if (event.type !== "ADD_MESSAGE") return false;
      const message = event.message.trim();
      return message.length > 0 && message.length <= env.MAX_REASON_LENGTH;
    },
    isReadyForDecision: ({ context }) => {
      return context.reason !== undefined;
    },
    isUnprocessed: ({ context }) => {
      return context.decision === undefined;
    },
    canApproveOrDecline: ({ context }) => {
      // Compose isReadyForDecision && isUnprocessed
      return context.reason !== undefined && context.decision === undefined;
    },
  },
  actions: {
    setReason: assign(({ event }) => {
      if (event.type !== "SUBMIT_REASON") return {};
      return { reason: event.reason.trim() };
    }),
    setAdminMsgId: assign(({ event }) => {
      if (event.type !== "SET_ADMIN_MSG_ID") return {};
      return { adminMsgId: event.adminMsgId };
    }),
    addMessage: assign(({ context, event }) => {
      if (event.type !== "ADD_MESSAGE") return {};
      return {
        additionalMessages: [
          ...context.additionalMessages,
          event.message.trim(),
        ],
      };
    }),
    markApproved: assign(({ event }) => {
      if (event.type !== "APPROVE") return {};
      return {
        decision: {
          status: "approved" as const,
          adminId: event.adminId,
          adminName: event.adminName,
          at: Date.now(),
        },
      };
    }),
    markDeclined: assign(({ event }) => {
      if (event.type !== "DECLINE") return {};
      return {
        decision: {
          status: "declined" as const,
          adminId: event.adminId,
          adminName: event.adminName,
          at: Date.now(),
        },
      };
    }),
  },
}).createMachine({
  id: "joinRequest",
  context: ({ input }) => ({
    ...input,
    reason: undefined,
    additionalMessages: [],
    adminMsgId: undefined,
    decision: undefined,
  }),
  initial: "pending",
  states: {
    pending: {
      on: {
        START_COLLECTION: {
          target: "collectingReason",
        },
      },
    },
    collectingReason: {
      on: {
        SUBMIT_REASON: {
          target: "awaitingReview",
          guard: "isValidReason",
          actions: "setReason",
        },
      },
    },
    awaitingReview: {
      on: {
        SET_ADMIN_MSG_ID: {
          actions: "setAdminMsgId",
        },
        ADD_MESSAGE: {
          guard: "isValidMessage",
          actions: "addMessage",
        },
        APPROVE: {
          target: "approved",
          guard: "canApproveOrDecline",
          actions: "markApproved",
        },
        DECLINE: {
          target: "declined",
          guard: "canApproveOrDecline",
          actions: "markDeclined",
        },
      },
    },
    approved: {
      type: "final",
    },
    declined: {
      type: "final",
    },
  },
});
