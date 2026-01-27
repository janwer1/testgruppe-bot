import { Redis } from "@upstash/redis";
import type { BotConfig } from "../config";

export interface RequestState {
  targetChatId: number;
  userId: number;
  adminMsgId?: number;
  reason?: string;
  userName: string;
  username?: string;
  timestamp: number;
  additionalMessages: string[]; // Always initialized, never optional
  // Decision fields
  decisionStatus?: "approved" | "declined";
  decisionAdminId?: number;
  decisionAdminName?: string;
  decisionAt?: number;
}

export interface StateStoreInterface {
  set(requestId: string, state: RequestState): Promise<void>;
  get(requestId: string): Promise<RequestState | undefined>;
  setUserActiveRequest(userId: number, requestId: string): Promise<void>;
  clearUserActiveRequest(userId: number): Promise<void>;
  getActiveRequestIdByUserId(userId: number): Promise<string | undefined>;
  addToTimeline(requestId: string, timestamp: number): Promise<void>;
  getRecentRequests(limit: number): Promise<string[]>;
}

export class RedisStateStore implements StateStoreInterface {
  private redis: Redis;
  private ttl: number;

  constructor(config: BotConfig) {
    if (!config.upstashRedisRestUrl || !config.upstashRedisRestToken) {
      throw new Error("upstashRedisRestUrl and upstashRedisRestToken are required for Redis state store");
    }

    this.redis = new Redis({
      url: config.upstashRedisRestUrl,
      token: config.upstashRedisRestToken,
    });
    this.ttl = 604800; // Default 1 week, could be configurable
  }

  private requestKey(requestId: string): string {
    return `request:${requestId}`;
  }

  private userActiveRequestKey(userId: number): string {
    return `user:${userId}:activeRequest`;
  }

  private timelineKey(): string {
    return "requests:timeline";
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

  async addToTimeline(requestId: string, _timestamp: number): Promise<void> {
    try {
      // Use score 0 to rely on lexicographical sorting of members.
      // Since members are ULIDs (time-ordered strings), this sorts by time.
      await this.redis.zadd(this.timelineKey(), {
        score: 0,
        member: requestId,
      });
      // Trim timeline to keep only recent 1000 requests.
      // For lexicographical sorting (all scores 0), Redis sorts A-Z.
      // zrange 0 -1 returns oldest first.
      // zremrangebyrank 0 -1001 removes "all but last 1000 items".
      // This logic remains correct for score=0 + ULID.
      await this.redis.zremrangebyrank(this.timelineKey(), 0, -1001);
    } catch (error) {
      console.error(`[RedisStateStore] Error adding to timeline for request ${requestId}:`, error);
    }
  }

  async getRecentRequests(limit: number): Promise<string[]> {
    try {
      // Get the most recent requests.
      // With score 0, ZRANGE ... REV gives us Reverse Lexicographical order (Z-A).
      // Since ULIDs grow alphabetically over time, Z is newest.
      // So this returns newest requests first.
      const result = await this.redis.zrange(this.timelineKey(), 0, limit - 1, {
        rev: true,
      });
      return result as string[];
    } catch (error) {
      console.error("[RedisStateStore] Error getting recent requests:", error);
      return [];
    }
  }
}

export class MemoryStateStore implements StateStoreInterface {
  private store: Map<string, RequestState> = new Map();
  private userActiveRequests: Map<number, string> = new Map(); // userId -> requestId
  private timeline: Array<{ requestId: string; timestamp: number }> = [];
  private ttl: number;

  constructor(_config?: BotConfig) {
    // Config optional for tests
    this.ttl = 604800 * 1000; // Default 1 week in ms
    // Clean up expired entries every 5 minutes
    if (typeof setInterval !== "undefined") {
      setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
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

  async addToTimeline(requestId: string, timestamp: number): Promise<void> {
    this.timeline.push({ requestId, timestamp });
    // Sort by requestId descending (since ULID matches time)
    this.timeline.sort((a, b) => b.requestId.localeCompare(a.requestId));
    if (this.timeline.length > 1000) {
      this.timeline = this.timeline.slice(0, 1000);
    }
  }

  async getRecentRequests(limit: number): Promise<string[]> {
    return this.timeline.slice(0, limit).map((t) => t.requestId);
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
    // Clean up timeline
    this.timeline = this.timeline.filter((item) => {
      const state = this.store.get(item.requestId);
      return state && now - state.timestamp <= this.ttl;
    });
  }
}

export function createStateStore(config: BotConfig): StateStoreInterface {
  const isTest = process.env.NODE_ENV === "test" || process.env.BUN_ENV === "test";
  const hasRedisConfig = !!(
    config.upstashRedisRestUrl &&
    config.upstashRedisRestToken &&
    !config.upstashRedisRestUrl.includes("example.com")
  );

  if (!isTest && hasRedisConfig) {
    console.log("[StateStore] Using Redis for persistent storage");
    return new RedisStateStore(config);
  } else {
    console.log(`[StateStore] Using in-memory storage (${isTest ? "Test Mode" : "Redis not configured"})`);
    return new MemoryStateStore(config);
  }
}
