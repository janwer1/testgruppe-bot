# Architecture & Patterns

## Core Stack
- **Platform**: Cloudflare Workers (Edge)
- **Framework**: grammY (Stateless mode)
- **State Logic**: XState v5 (Domain-driven)
- **Storage**: Upstash Redis (REST API)
- **Runtime**: Bun (Local Dev & Tests)

## Key Technical Patterns

### 1. Statelessness
Local memory/sessions are **NOT** used. All state is hydrated from Redis per-request:
1. Fetch `userId` from Update.
2. Load `JoinRequest` from Redis.
3. Apply logic via `XState` actor.
4. Save back to Redis.

### 2. Environment (env.ts)
Cloudflare bindings are mapped to a global `env` object via `initEnv(cfEnv)` inside the worker's `fetch` handler. 
**NEVER** use `process.env` directly in domain logic; use the exported `env` object.

### 3. Webhook Management
Use `src/scripts/webhook.ts` for all configuration. Operations are grouped: `get`, `setup`, `test`.
