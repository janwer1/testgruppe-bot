import { pino, type DestinationStream } from "pino";
import { Writable } from "stream";
import pinoPretty from "pino-pretty";
import { env } from "../env";

export function setupLogger() {
    // Custom writable stream that writes to console.log
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
            ignore: "pid,hostname",
            translateTime: "HH:MM:ss",
        });
    }

    const logger = pino({
        level: env.LOG_LEVEL || 'info',
        base: undefined,
        timestamp: pino.stdTimeFunctions.isoTime,
    }, maybePretty);

    return logger;
}

export const logger = setupLogger();
