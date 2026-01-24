# Vercel + grammY Bot

## Architecture & Working Pattern

We use a **Vercel Edge Runtime** architecture for maximum performance and standard Web API compatibility.

### Core Stack
1.  **Platform**: Vercel Serverless Functions
2.  **Runtime**: **Edge** (`runtime: 'edge'`)
3.  **Framework**: grammY
4.  **Adapter**: `"std/http"` (Compatible with Edge's standard `Request`/`Response`)
5.  **State**: Upstash Redis (HTTP-based, Edge-compatible)

### Reference Implementation
**`api/bot.ts`**:
```typescript
import { Bot, webhookCallback, Context, SessionFlavor } from "grammy";
import { Redis } from "@upstash/redis";

// 1. Types: Must define custom Context for SessionFlavor
type MyContext = Context & SessionFlavor<SessionData>;

// 2. State: Use Upstash Redis (HTTP client works in Edge)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

// 3. Adapter: "std/http" expects standard Web API Request/Response
const handler = webhookCallback(bot, "std/http");

// 4. Runtime: MUST be set to "edge" to provide standard Web APIs
export const config = {
  runtime: "edge",
};

export default async (req: Request) => {
  return await handler(req);
};
```

## Key Architectural Decisions

1.  **Edge Runtime (`export const config = { runtime: 'edge' }`)**
    *   **Why**: Provides standard `Request` and `Response` objects (Web API).
    *   **Benefit**: Compatible with grammY's `"std/http"` adapter. No need for complex Node-specific adapters (`"https"` or `"express"`).
    *   **Performance**: Near-zero cold start, ideal for Telegram webhooks.

2.  **Adapter: `"std/http"`**
    *   **Why**: Default adapter for standard Web environments (Deno, Cloudflare Workers, Vercel Edge).
    *   **Note**: DO NOT use `"https"` or `http` adapter with Edge Runtime; they expect Node.js-specific objects.

3.  **Upstash Redis**
    *   **Why**: It uses a REST (HTTP) API, not a persistent TCP connection.
    *   **Benefit**: Fully compatible with serverless/edge environments where TCP connections are difficult to manage.

## Troubleshooting

-   **Error**: `req.headers.get is not a function`
    *   **Cause**: You are likely running in the default Node.js runtime (which uses `IncomingMessage`) but using the `"std/http"` adapter.
    *   **Fix**: Add `export const config = { runtime: 'edge' };` to your API route.

## Environment Variables

Set in Vercel Project Settings:
- `BOT_TOKEN` - Telegram bot token
- `UPSTASH_REDIS_REST_URL` - Upstash Redis URL (for sessions)
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token (for sessions)
- `WEBHOOK_SECRET_TOKEN` - Secret for webhook validation (optional)

## Deployment

```bash
vercel --prod
```

Websocket URL: `https://your-project.vercel.app/api/bot`
