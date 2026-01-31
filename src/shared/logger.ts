import { pino } from "pino";
import { parseEnv } from "./env";

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
      write: (o) => console.log(JSON.stringify(o)),
    },
  });
}

export const logger = setupLogger();
