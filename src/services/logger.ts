import { pino, type DestinationStream } from "pino";
import { Writable } from "stream";
import pinoPretty from "pino-pretty";
import { env } from "../env";

// Setup pino logger, using pino-pretty if available (should only be used for dev, not prod !)
export function setupLogger() {
    // Custom writable stream that writes to console.log
    // This avoids doubling prefixes when using process.stdout in some environments (like Cloudflare Workers)
    const consoleStream = new Writable({
        write(chunk, _, callback) {
            console.log(chunk.toString());
            callback();
        }
    });

    let maybePretty: DestinationStream = consoleStream;

    // Use pino-pretty in dev mode
    if (env.MODE === "dev" && Object.keys(pinoPretty).length > 0) {
        maybePretty = pinoPretty.build({
            colorize: true,
            destination: consoleStream,
            ignore: "pid,hostname", // Clean up output by hiding pid/hostname
            translateTime: "HH:MM:ss", // Clean time format
        });
    }

    const logger = pino({
        level: env.LOG_LEVEL || 'info',
        base: undefined, // Remove pid and hostname from JSON logs as well
        timestamp: pino.stdTimeFunctions.isoTime,
    }, maybePretty);

    return logger;
}

export const logger = setupLogger();
