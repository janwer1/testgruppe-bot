import { Writable } from "node:stream";
import { type DestinationStream, pino } from "pino";
import pinoPretty from "pino-pretty";
import { parseEnv } from "../env";

export function setupLogger() {
  // Custom writable stream that writes to console.log
  const consoleStream = new Writable({
    write(chunk, _, callback) {
      console.log(chunk.toString());
      callback();
    },
  });

  let maybePretty: DestinationStream = consoleStream;
  const env = parseEnv();

  // Use pino-pretty in dev mode
  if (env.MODE === "dev" && Object.keys(pinoPretty).length > 0) {
    maybePretty = pinoPretty.build({
      colorize: true,
      destination: consoleStream,
      ignore: "pid,hostname",
      translateTime: "HH:MM:ss",
    });
  }

  const logger = pino(
    {
      level: env.LOG_LEVEL || "info", // pino handles this better if base undefined
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    maybePretty,
  );

  return logger;
}

export const logger = setupLogger();
