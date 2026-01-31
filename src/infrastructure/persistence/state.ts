import type { BotConfig } from "../../shared/config";
import { logger } from "../../shared/logger";

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
}

export interface StateStoreInterface {
  set(requestId: string, state: RequestState): Promise<void>;
  get(requestId: string): Promise<RequestState | undefined>;
  setUserActiveRequest(userId: number, requestId: string): Promise<void>;
  clearUserActiveRequest(userId: number): Promise<void>;
  getActiveRequestIdByUserId(userId: number): Promise<string | undefined>;
  addToTimeline(requestId: string, timestamp: number): Promise<void>;
  addToTimeline(requestId: string, timestamp: number): Promise<void>;
  getRecentRequests(limit: number, status?: "pending" | "completed"): Promise<string[]>;
}

export class MemoryStateStore implements StateStoreInterface {
  private store: Map<string, RequestState> = new Map();
  private userActiveRequests: Map<number, string> = new Map(); // userId -> requestId
  private timeline: Array<{ requestId: string; timestamp: number }> = [];
  private ttl: number;

  constructor(_config?: BotConfig) {
    // Config optional for tests
    this.ttl = (_config?.reasonTtlSeconds ?? 604800) * 1000;
    // Clean up expired entries every 5 minutes
    if (typeof setInterval !== "undefined") {
      const interval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
      // Allows the process to exit if this is the only thing left in the event loop
      if (typeof interval.unref === "function") {
        interval.unref();
      }
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

  async getRecentRequests(limit: number, status?: "pending" | "completed"): Promise<string[]> {
    if (!status) {
      return this.timeline.slice(0, limit).map((t) => t.requestId);
    }

    const filtered: string[] = [];
    for (const item of this.timeline) {
      if (filtered.length >= limit) break;

      const state = this.store.get(this.requestKey(item.requestId));
      if (!state) continue;

      const isCompleted = state.decisionStatus === "approved" || state.decisionStatus === "declined";

      if (status === "completed" && isCompleted) {
        filtered.push(item.requestId);
      } else if (status === "pending" && !isCompleted) {
        filtered.push(item.requestId);
      }
    }
    return filtered;
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

  // 1. Explicit Selection
  if (config.storageType) {
    switch (config.storageType) {
      case "d1":
        if (config.db) {
          logger.info({ component: "StateStore" }, "Using D1 (SQLite) as requested via STORAGE_TYPE");
          const { D1StateStore } = require("./d1/D1StateStore");
          const { getD1Database } = require("./d1/client");
          return new D1StateStore(getD1Database(config.db));
        }

        // Fallback for local development
        logger.warn(
          { component: "StateStore" },
          "STORAGE_TYPE=d1 but no DB binding found. Fallback to auto-detection/memory.",
        );
        break;

      case "memory":
        logger.info({ component: "StateStore" }, "Using Memory as requested via STORAGE_TYPE");
        return new MemoryStateStore(config);
    }
  }

  // 2. Auto-detection (Priority: D1 > Memory)
  if (config.db) {
    logger.info({ component: "StateStore" }, "Auto-detected D1 Database");
    const { D1StateStore } = require("./d1/D1StateStore");
    const { getD1Database } = require("./d1/client");
    return new D1StateStore(getD1Database(config.db));
  }

  logger.info({ component: "StateStore", testMode: isTest }, "Using in-memory storage");
  return new MemoryStateStore(config);
}
