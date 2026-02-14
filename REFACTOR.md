# Refactoring Suggestions

## 1. Structured Error Handling

Replace `String(error)` with typed domain errors for better error handling and debugging.

### New File: `src/domain/errors.ts`

```typescript
export type JoinRequestErrorCode =
  | 'INVALID_STATE'
  | 'VALIDATION_FAILED'
  | 'ALREADY_PROCESSED';

export class JoinRequestError extends Error {
  constructor(
    public code: JoinRequestErrorCode,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'JoinRequestError';
  }
}
```

### Update: `src/domain/JoinRequest.ts`

Replace error handling in methods like `decline()`, `approve()`, `submitReason()`:

```typescript
decline(adminId: number, adminName: string): { success: boolean; error?: JoinRequestError } {
  if (!this.isInState("awaitingReview")) {
    return {
      success: false,
      error: new JoinRequestError('INVALID_STATE', 'Request is not awaiting review')
    };
  }

  if (this.isProcessed()) {
    return {
      success: false,
      error: new JoinRequestError('ALREADY_PROCESSED', 'Request has already been processed')
    };
  }

  try {
    this.actor.send({ type: "DECLINE", adminId, adminName });
    this.syncContext();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: new JoinRequestError('INVALID_STATE', 'Failed to decline request', error)
    };
  }
}
```

### Benefits

- Typed error codes enable precise error handling at call sites
- `cause` property preserves original error for debugging
- Easier to add error logging/metrics by code

---

## 2. XState Persist/Restore Pattern

Replace linear event replay with XState's built-in snapshot serialization to eliminate fragility when restoring state.

### Update: `src/infrastructure/persistence/state.ts`

Add `machineState` to the `RequestState` interface:

```typescript
export interface RequestState {
  targetChatId: number;
  userId: number;
  adminMsgId?: number;
  reason?: string;
  displayName: string;
  username?: string;
  timestamp: number;
  additionalMessages: string[];
  decisionStatus?: "approved" | "declined";
  decisionAdminId?: number;
  decisionAdminName?: string;
  decisionAt?: number;
  machineState?: string; // JSON-serialized XState snapshot
}
```

### Update: `src/domain/JoinRequest.ts`

Add snapshot methods:

```typescript
import { type SnapshotFrom } from "xstate";

type PersistedSnapshot = SnapshotFrom<typeof joinRequestMachine>;

getSnapshot(): PersistedSnapshot {
  return this.actor.getPersistedSnapshot();
}

static fromSnapshot(snapshot: PersistedSnapshot): JoinRequest {
  const request = Object.create(JoinRequest.prototype);
  request.actor = createActor(joinRequestMachine, { snapshot });
  request.actor.start();
  request.syncContext();
  return request;
}
```

### Update: `src/infrastructure/persistence/JoinRequestRepository.ts`

**In `save()`:**

```typescript
async save(request: JoinRequest): Promise<void> {
  const context = request.getContext();

  const requestState: RequestState = {
    targetChatId: context.targetChatId,
    userId: context.userId,
    adminMsgId: context.adminMsgId,
    reason: context.reason,
    displayName: context.displayName,
    username: context.username,
    timestamp: context.timestamp,
    additionalMessages: context.additionalMessages,
    decisionStatus: context.decision?.status,
    decisionAdminId: context.decision?.adminId,
    decisionAdminName: context.decision?.adminName,
    decisionAt: context.decision?.at,
    machineState: JSON.stringify(request.getSnapshot()),
  };

  await this.store.set(context.requestId, requestState);
  // ... rest of method
}
```

**In `hydrateFromState()`:**

```typescript
private hydrateFromState(requestId: string, state: RequestState): JoinRequest | undefined {
  // Try snapshot restoration first (preferred)
  if (state.machineState) {
    try {
      const snapshot = JSON.parse(state.machineState);
      const request = JoinRequest.fromSnapshot(snapshot);
      this.attachLogger(request);
      return request;
    } catch (error) {
      logger.warn({ component: 'Repository', requestId }, 'Failed to restore from snapshot, falling back to event replay');
    }
  }

  // Fallback: event replay (for legacy records without machineState)
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
```

### Benefits

- Eliminates fragility from event replay order dependencies
- Safe if state machine adds conditional transitions, parallel states, or history states
- Snapshot is ~1-2KB JSON - negligible overhead for D1
- Backward compatible with existing records via fallback
