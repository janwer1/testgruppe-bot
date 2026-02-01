#!/usr/bin/env bun
/**
 * Transform wrangler tail JSON output to zap-pretty compatible format
 *
 * Usage: wrangler tail <worker> | bun src/scripts/wrangler-to-zap.ts | zap-pretty
 */

import { createInterface } from "node:readline";

let buffer = "";

const levelToSeverity: Record<number, string> = {
  10: "DEBUG",
  20: "DEBUG",
  30: "INFO",
  40: "WARNING",
  50: "ERROR",
  60: "CRITICAL",
};

function transformPinoToZap(pinoLog: Record<string, unknown>): Record<string, unknown> {
  const zapLog: Record<string, unknown> = {};

  // Transform level (number) to severity (string)
  if (typeof pinoLog.level === "number") {
    zapLog.severity = levelToSeverity[pinoLog.level] ?? "INFO";
  }

  // Transform msg to message
  if (typeof pinoLog.msg === "string") {
    zapLog.message = pinoLog.msg;
  }

  // Copy other fields
  for (const [key, value] of Object.entries(pinoLog)) {
    if (key !== "level" && key !== "msg") {
      zapLog[key] = value;
    }
  }

  return zapLog;
}

function processLogLine(logLine: string): void {
  try {
    const pinoLog = JSON.parse(logLine) as Record<string, unknown>;

    // Check if this looks like a pino log (has numeric level and msg)
    if (typeof pinoLog.level === "number" && typeof pinoLog.msg === "string") {
      const zapLog = transformPinoToZap(pinoLog);
      console.log(JSON.stringify(zapLog));
    } else {
      // Pass through as-is if not pino format
      console.log(logLine);
    }
  } catch {
    // Invalid JSON, skip
  }
}

function processData(data: unknown): void {
  // Handle wrangler tail output format
  if (data && typeof data === "object" && "logs" in data && Array.isArray(data.logs)) {
    for (const log of data.logs) {
      if (log && typeof log === "object" && "message" in log && Array.isArray(log.message) && log.message.length > 0) {
        // message is an array with the actual log JSON as first element
        const logLine = log.message[0];
        if (typeof logLine === "string") {
          processLogLine(logLine);
        }
      }
    }
  }
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", (line) => {
  buffer += line;

  // Try to parse accumulated buffer as JSON
  try {
    const data = JSON.parse(buffer);
    processData(data);
    buffer = ""; // Reset buffer after successful parse
  } catch {
    // Not complete JSON yet, keep accumulating
    // Add newline back since readline strips it
    buffer += "\n";
  }
});

rl.on("close", () => {
  // Try to process any remaining buffer
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      processData(data);
    } catch {
      // Invalid JSON at end, ignore
    }
  }
});
