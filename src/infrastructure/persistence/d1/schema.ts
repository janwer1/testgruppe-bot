import { type } from "arktype";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { arktypeJsonTable } from "./factory";

// Define the schema for a Join Request
// This matches our domain model but with strict types for storage
export const RequestStateSchema = type({
  requestId: "string",
  userId: "number",
  targetChatId: "number",
  displayName: "string",
  username: "string | undefined",
  reason: "string | undefined",
  timestamp: "Date",
  additionalMessages: "string[]",
  adminMsgId: "number | undefined",
  decisionStatus: "'approved' | 'declined' | undefined",
  decisionAdminId: "number | undefined",
  decisionAdminName: "string | undefined",
  decisionAt: "Date | undefined",
});

export type RequestState = typeof RequestStateSchema.infer;

// Factory function to get the repository instance
// biome-ignore lint/suspicious/noExplicitAny: Generic database type
export const getRequestsRepository = (db: DrizzleD1Database<any> | BunSQLiteDatabase<any>) => {
  return arktypeJsonTable(
    "JoinRequest",
    RequestStateSchema,
    "requests",
    db,
    // Create indexes on these fields for fast querying
    ["userId", "requestId", "decisionStatus", "adminMsgId"],
  );
};
