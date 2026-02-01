import { pino } from "pino";
import { parseEnv } from "./env";

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "bigint") return val.toString();

    if (val instanceof Error) {
      return {
        type: val.name,
        message: val.message,
        stack: val.stack,
      };
    }

    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }

    return val;
  });
}

/**
 * Creates a configured logger instance.
 * In development mode, it uses a custom browser writer to ensure
 * pretty-printed logs that prioritize the message and component.
 */
export function setupLogger() {
  let env: { LOG_LEVEL?: string };
  try {
    env = parseEnv();
  } catch (_error) {
    // If parsing fails (e.g. in tests missing env vars), fallback to defaults
    env = { LOG_LEVEL: "info" };
  }

  return pino({
    level: env.LOG_LEVEL || "info",
    base: undefined,
    // Use ISO timestamp for reliable log parsing
    timestamp: pino.stdTimeFunctions.isoTime,
    browser: {
      serialize: true,
      asObject: true,
      write: (o) => {
        try {
          console.log(safeJsonStringify(o));
        } catch {
          // Never let logging crash the worker.
          console.log("[logger] failed to serialize log payload");
          console.log(o);
        }
      },
    },
  });
}

export const logger = setupLogger();
