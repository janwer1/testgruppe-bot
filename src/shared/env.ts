// Transform functions
const parseChatId = (val: string): number | undefined => {
  if (!val) return undefined;
  const num = parseInt(val, 10);
  if (Number.isNaN(num)) throw new Error("must be a valid number");
  if (num >= 0) throw new Error("must be a negative number");
  return num;
};

const parsePositiveInt = (val: string): number | undefined => {
  if (!val) return undefined;
  const num = parseInt(val, 10);
  if (Number.isNaN(num) || num <= 0) throw new Error("must be a positive integer");
  return num;
};

const validateUrl = (val: string): string => {
  try {
    new URL(val);
    return val;
  } catch {
    throw new Error("must be a valid URL");
  }
};

export type Env = {
  MODE: "dev" | "prod";
  STORAGE_TYPE: "d1" | "memory" | undefined;
  BOT_TOKEN: string;
  TARGET_CHAT_ID: number | undefined;
  ADMIN_REVIEW_CHAT_ID: number | undefined;
  LOG_LEVEL: "debug" | "info" | "warn" | "error" | undefined;
  PUBLIC_BASE_URL: string;
  WEBHOOK_SECRET_TOKEN: string | undefined;
  REASON_TTL_SECONDS: number | undefined;
  MAX_REASON_CHARS: number | undefined;
  MIN_REASON_WORDS: number | undefined;
  TIMEZONE: string | undefined;
  JOIN_LINK: string | undefined;
  LOCAL_TUNNEL_URL: string | undefined;
};

export function parseEnv(runtimeEnv: Record<string, string | undefined> = process.env): Env {
  // Helper to get value with empty string as undefined
  const get = (key: string): string | undefined => {
    const val = runtimeEnv[key];
    return val === "" ? undefined : val;
  };

  // MODE with default
  const mode = get("MODE");
  const MODE: "dev" | "prod" = mode === "dev" || mode === "prod" ? mode : "prod";

  // STORAGE_TYPE - optional enum
  const storageType = get("STORAGE_TYPE");
  const STORAGE_TYPE: "d1" | "memory" | undefined =
    storageType === "d1" || storageType === "memory" ? storageType : undefined;

  // BOT_TOKEN - required
  const botToken = get("BOT_TOKEN");
  if (!botToken) throw new Error("BOT_TOKEN is required");
  const BOT_TOKEN: string = botToken;

  // Chat IDs - optional with transform
  const TARGET_CHAT_ID: number | undefined = parseChatId(get("TARGET_CHAT_ID") ?? "");
  const ADMIN_REVIEW_CHAT_ID: number | undefined = parseChatId(get("ADMIN_REVIEW_CHAT_ID") ?? "");

  // LOG_LEVEL - optional enum
  const logLevel = get("LOG_LEVEL");
  const LOG_LEVEL: "debug" | "info" | "warn" | "error" | undefined =
    logLevel === "debug" || logLevel === "info" || logLevel === "warn" || logLevel === "error" ? logLevel : undefined;

  // PUBLIC_BASE_URL - required with validation
  const publicBaseUrl = get("PUBLIC_BASE_URL");
  if (!publicBaseUrl) throw new Error("PUBLIC_BASE_URL is required");
  const PUBLIC_BASE_URL: string = validateUrl(publicBaseUrl);

  // WEBHOOK_SECRET_TOKEN - optional
  const WEBHOOK_SECRET_TOKEN: string | undefined = get("WEBHOOK_SECRET_TOKEN");

  // Numeric options - optional with transform
  const REASON_TTL_SECONDS: number | undefined = parsePositiveInt(get("REASON_TTL_SECONDS") ?? "");
  const MAX_REASON_CHARS: number | undefined = parsePositiveInt(get("MAX_REASON_CHARS") ?? "");
  const MIN_REASON_WORDS: number | undefined = parsePositiveInt(get("MIN_REASON_WORDS") ?? "");

  // TIMEZONE - optional
  const TIMEZONE: string | undefined = get("TIMEZONE");

  // URLs - optional with validation
  const joinLink = get("JOIN_LINK");
  const JOIN_LINK: string | undefined = joinLink ? validateUrl(joinLink) : undefined;

  const localTunnelUrl = get("LOCAL_TUNNEL_URL");
  const LOCAL_TUNNEL_URL: string | undefined = localTunnelUrl ? validateUrl(localTunnelUrl) : undefined;

  return {
    MODE,
    STORAGE_TYPE,
    BOT_TOKEN,
    TARGET_CHAT_ID,
    ADMIN_REVIEW_CHAT_ID,
    LOG_LEVEL,
    PUBLIC_BASE_URL,
    WEBHOOK_SECRET_TOKEN,
    REASON_TTL_SECONDS,
    MAX_REASON_CHARS,
    MIN_REASON_WORDS,
    TIMEZONE,
    JOIN_LINK,
    LOCAL_TUNNEL_URL,
  };
}
