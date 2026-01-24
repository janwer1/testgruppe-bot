import { env } from "../env";
import { Redis } from "@upstash/redis";

export interface RequestState {
  targetChatId: number;
  userId: number;
  adminMsgId?: number;
  reason?: string;
  userName: string;
  username?: string;
  timestamp: number;
  additionalMessages: string[]; // Always initialized, never optional
  // Decision fields (replaces processed boolean)
  decisionStatus?: "approved" | "declined";
  decisionAdminId?: number;
  decisionAdminName?: string;
  decisionAt?: number;
}

interface StateStoreInterface {
  set(requestId: string, state: RequestState): Promise<void>;
  get(requestId: string): Promise<RequestState | undefined>;
  setUserActiveRequest(userId: number, requestId: string): Promise<void>;
  clearUserActiveRequest(userId: number): Promise<void>;
  getActiveRequestIdByUserId(userId: number): Promise<string | undefined>;
}

// Redis-backed state store (production)
class RedisStateStore implements StateStoreInterface {
  private redis: Redis;
  private ttl: number;

  constructor() {
    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for Redis state store");
    }

    this.redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    this.ttl = env.REASON_TTL_SECONDS;
  }

  private requestKey(requestId: string): string {
    return `request:${requestId}`;
  }

  private userActiveRequestKey(userId: number): string {
    return `user:${userId}:activeRequest`;
  }

  async set(requestId: string, state: RequestState): Promise<void> {
    try {
      await this.redis.setex(this.requestKey(requestId), this.ttl, JSON.stringify(state));
    } catch (error) {
      console.error(`[RedisStateStore] Error setting request ${requestId}:`, error);
      throw error;
    }
  }

  async get(requestId: string): Promise<RequestState | undefined> {
    try {
      const data = await this.redis.get(this.requestKey(requestId));
      if (!data) {
        return undefined;
      }
      // Handle both string and already-parsed data
      if (typeof data === "string") {
        return JSON.parse(data) as RequestState;
      }
      return data as RequestState;
    } catch (error) {
      console.error(`[RedisStateStore] Error getting request ${requestId}:`, error);
      return undefined;
    }
  }

  async setUserActiveRequest(userId: number, requestId: string): Promise<void> {
    await this.redis.setex(this.userActiveRequestKey(userId), this.ttl, requestId);
  }

  async clearUserActiveRequest(userId: number): Promise<void> {
    await this.redis.del(this.userActiveRequestKey(userId));
  }

  async getActiveRequestIdByUserId(userId: number): Promise<string | undefined> {
    try {
      const requestId = await this.redis.get(this.userActiveRequestKey(userId));
      if (!requestId) {
        return undefined;
      }
      // Handle both string and already-parsed data
      if (typeof requestId === "string") {
        return requestId;
      }
      return String(requestId);
    } catch (error) {
      console.error(`[RedisStateStore] Error getting active request ID for user ${userId}:`, error);
      return undefined;
    }
  }
}

// In-memory state store (development fallback)
class MemoryStateStore implements StateStoreInterface {
  private store: Map<string, RequestState> = new Map();
  private userActiveRequests: Map<number, string> = new Map(); // userId -> requestId
  private ttl: number;

  constructor() {
    this.ttl = env.REASON_TTL_SECONDS * 1000; // Convert to milliseconds
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private requestKey(requestId: string): string {
    return requestId;
  }

  async set(requestId: string, state: RequestState): Promise<void> {
    this.store.set(this.requestKey(requestId), state);
  }

  async get(requestId: string): Promise<RequestState | undefined> {
    const state = this.store.get(this.requestKey(requestId));
    if (!state) {
      return undefined;
    }

    // Check if expired
    const now = Date.now();
    if (now - state.timestamp > this.ttl) {
      this.store.delete(this.requestKey(requestId));
      return undefined;
    }

    return state;
  }

  async setUserActiveRequest(userId: number, requestId: string): Promise<void> {
    this.userActiveRequests.set(userId, requestId);
  }

  async clearUserActiveRequest(userId: number): Promise<void> {
    this.userActiveRequests.delete(userId);
  }

  async getActiveRequestIdByUserId(userId: number): Promise<string | undefined> {
    const requestId = this.userActiveRequests.get(userId);
    if (!requestId) {
      return undefined;
    }
    // Verify the request still exists and is not expired
    const state = await this.get(requestId);
    if (!state || state.decisionStatus) {
      this.userActiveRequests.delete(userId);
      return undefined;
    }
    return requestId;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [requestId, state] of this.store.entries()) {
      if (now - state.timestamp > this.ttl) {
        this.store.delete(requestId);
      }
    }
      // Clean up expired user active request mappings
      for (const [userId, requestId] of this.userActiveRequests.entries()) {
        const state = this.store.get(this.requestKey(requestId));
        if (!state || now - state.timestamp > this.ttl || state.decisionStatus) {
          this.userActiveRequests.delete(userId);
        }
      }
    }
  }

// Create state store based on environment
let stateStore: StateStoreInterface;

if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  console.log("[StateStore] Using Redis for persistent storage");
  stateStore = new RedisStateStore();
} else {
  console.log("[StateStore] Using in-memory storage (Redis not configured)");
  stateStore = new MemoryStateStore();
}

export { stateStore };
