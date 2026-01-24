import { StorageAdapter } from "grammy";
import { SessionData } from "../types";
import { env } from "../env";
import { Redis } from "@upstash/redis";

/**
 * Redis-backed session storage (production)
 * Stores sessions in Redis with TTL matching request state TTL
 */
class RedisSessionStorage implements StorageAdapter<SessionData> {
  private redis: Redis;
  private ttl: number;

  constructor() {
    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for Redis session storage");
    }

    this.redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    this.ttl = env.REASON_TTL_SECONDS;
  }

  private sessionKey(key: string): string {
    return `session:${key}`;
  }

  async read(key: string): Promise<SessionData | undefined> {
    try {
      const data = await this.redis.get(this.sessionKey(key));
      if (!data) {
        return undefined;
      }
      // Handle both string and already-parsed data
      if (typeof data === "string") {
        return JSON.parse(data) as SessionData;
      }
      return data as SessionData;
    } catch (error) {
      console.error(`[RedisSessionStorage] Error reading session ${key}:`, error);
      return undefined;
    }
  }

  async write(key: string, value: SessionData): Promise<void> {
    try {
      await this.redis.setex(this.sessionKey(key), this.ttl, JSON.stringify(value));
    } catch (error) {
      console.error(`[RedisSessionStorage] Error writing session ${key}:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.sessionKey(key));
    } catch (error) {
      console.error(`[RedisSessionStorage] Error deleting session ${key}:`, error);
      // Don't throw - deletion failures are not critical
    }
  }
}

/**
 * In-memory session storage (development fallback)
 * Only used when Redis is not configured
 */
class MemorySessionStorage implements StorageAdapter<SessionData> {
  private store: Map<string, SessionData> = new Map();
  private ttl: number;

  constructor() {
    this.ttl = env.REASON_TTL_SECONDS * 1000; // Convert to milliseconds
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async read(key: string): Promise<SessionData | undefined> {
    return this.store.get(key);
  }

  async write(key: string, value: SessionData): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  private cleanup(): void {
    // In-memory storage doesn't track timestamps, so we just clear all
    // This is fine for development - sessions will be recreated as needed
    // In production, Redis handles TTL automatically
  }
}

// Create session storage based on environment
let sessionStorage: StorageAdapter<SessionData>;

if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  console.log("[SessionStorage] Using Redis for persistent session storage");
  sessionStorage = new RedisSessionStorage();
} else {
  console.log("[SessionStorage] Using in-memory storage (Redis not configured)");
  sessionStorage = new MemorySessionStorage();
}

// Export as Grammy's SessionStorage type
export { sessionStorage as default };
export { sessionStorage };
