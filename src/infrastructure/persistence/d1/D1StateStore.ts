import { desc, eq, isNull, or, type SQL } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { RequestState, StateStoreInterface } from "../state";
import { type RequestState as DbRequestState, getRequestsRepository } from "./schema";

export class D1StateStore implements StateStoreInterface {
  private repo;
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle database with generic schema
  private db: DrizzleD1Database<any> | BunSQLiteDatabase<any>;

  // biome-ignore lint/suspicious/noExplicitAny: Drizzle database with generic schema
  constructor(db: DrizzleD1Database<any> | BunSQLiteDatabase<any>) {
    this.db = db;
    this.repo = getRequestsRepository(db);
  }

  async set(requestId: string, state: RequestState): Promise<void> {
    const data: DbRequestState = {
      requestId: requestId,
      userId: state.userId,
      targetChatId: state.targetChatId,
      displayName: state.displayName,
      username: state.username,
      reason: state.reason,
      timestamp: new Date(state.timestamp),
      additionalMessages: state.additionalMessages,
      adminMsgId: state.adminMsgId,
      decisionStatus: state.decisionStatus,
      decisionAdminId: state.decisionAdminId,
      decisionAdminName: state.decisionAdminName,
      decisionAt: state.decisionAt ? new Date(state.decisionAt) : undefined,
      machineState: state.machineState,
    };

    await this.repo.upsert(data, requestId);
  }

  async get(requestId: string): Promise<RequestState | undefined> {
    const row = await this.repo.findById(requestId);
    if (!row) return undefined;

    const data = row as DbRequestState;

    return {
      targetChatId: data.targetChatId,
      userId: data.userId,
      adminMsgId: data.adminMsgId,
      reason: data.reason || undefined, // Map null/undefined
      displayName: data.displayName,
      username: data.username || undefined,
      timestamp: data.timestamp.getTime(),
      additionalMessages: data.additionalMessages || [],
      decisionStatus: data.decisionStatus || undefined,
      decisionAdminId: data.decisionAdminId || undefined,
      decisionAdminName: data.decisionAdminName || undefined,
      decisionAt: data.decisionAt?.getTime(),
      machineState: data.machineState || undefined,
    };
  }

  async setUserActiveRequest(_userId: number, _requestId: string): Promise<void> {
    // No-op: D1 is the source of truth, we don't need a separate index key
    // The active request is determined by query in getActiveRequestIdByUserId
  }

  async clearUserActiveRequest(_userId: number): Promise<void> {
    // No-op: status change in the request itself (via set) clears it effectively from active queries
  }

  async getActiveRequestIdByUserId(userId: number): Promise<string | undefined> {
    // Find requests for this user
    // We want the most recent active one
    const requests = await this.repo.findByField("userId", userId);

    if (!requests || requests.length === 0) return undefined;

    // Filter for requests that are NOT processed (no decisionStatus)
    const activeRequests = requests.filter((r: DbRequestState) => !r.decisionStatus);

    if (activeRequests.length === 0) return undefined;

    // If multiple (shouldn't happen usually), pick the latest
    // Sort by requestId desc (ULID is sortable)
    activeRequests.sort((a: DbRequestState, b: DbRequestState) => {
      if (a.requestId > b.requestId) return -1;
      if (a.requestId < b.requestId) return 1;
      return 0;
    });

    return activeRequests[0].requestId;
  }

  async addToTimeline(_requestId: string, _timestamp: number): Promise<void> {
    // No-op: Timeline is derived from the main table's timestamp
  }

  async getRecentRequests(limit: number, status?: "pending" | "completed"): Promise<string[]> {
    const table = this.repo.table;

    // Use the repository proxy to get the decisionStatus column for filtering
    const decisionStatusCol = this.repo.proxy.decisionStatus;

    let whereClause: SQL | undefined;

    if (status === "pending") {
      // Pending means decisionStatus IS NULL
      whereClause = isNull(decisionStatusCol);
    } else if (status === "completed") {
      // Completed means decisionStatus IS 'approved' OR 'declined'
      whereClause = or(eq(decisionStatusCol, "approved"), eq(decisionStatusCol, "declined"));
    }

    // biome-ignore lint/suspicious/noExplicitAny: Drizzle select on dynamic db
    const results = await (this.db as any)
      .select({ id: table.id })
      .from(table)
      .where(whereClause)
      .orderBy(desc(table.id))
      .limit(limit);

    return results.map((r: { id: string }) => r.id);
  }

  async getRecentRequestStates(
    limit: number,
    status?: "pending" | "completed",
  ): Promise<Array<{ requestId: string; state: RequestState }>> {
    const table = this.repo.table;
    const decisionStatusCol = this.repo.proxy.decisionStatus;

    let whereClause: SQL | undefined;

    if (status === "pending") {
      whereClause = isNull(decisionStatusCol);
    } else if (status === "completed") {
      whereClause = or(eq(decisionStatusCol, "approved"), eq(decisionStatusCol, "declined"));
    }

    // Use the repo wrapper so `data` is deserialized via superjson.
    const rows = (await this.repo.query().where(whereClause).orderBy(desc(table.id)).limit(limit).all()) as Array<
      { id: string } & DbRequestState
    >;

    return rows.map((row) => {
      const data = row as unknown as DbRequestState;
      return {
        requestId: row.id,
        state: {
          targetChatId: data.targetChatId,
          userId: data.userId,
          adminMsgId: data.adminMsgId,
          reason: data.reason || undefined,
          displayName: data.displayName,
          username: data.username || undefined,
          timestamp: data.timestamp.getTime(),
          additionalMessages: data.additionalMessages || [],
          decisionStatus: data.decisionStatus || undefined,
          decisionAdminId: data.decisionAdminId || undefined,
          decisionAdminName: data.decisionAdminName || undefined,
          decisionAt: data.decisionAt?.getTime(),
          machineState: data.machineState || undefined,
        },
      };
    });
  }
}
