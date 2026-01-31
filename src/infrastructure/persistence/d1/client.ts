import { drizzle } from "drizzle-orm/d1";

// Helper to get the Drizzle client from the binding
export function getD1Database(bind: D1Database) {
  return drizzle(bind);
}
