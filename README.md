# Telegram Join Request Bot

Production-ready Telegram bot that automates the join request review process for private channels using grammY, Bun, and TypeScript. 

See [AGENTS.md](./AGENTS.md) for architectural details and implementation patterns.

## Features

- Automatically detects join requests for the configured channel
- Collects user reasons via DM conversations
- Posts review cards to admin group with approve/decline buttons
- Verifies admin authorization before processing actions
- Supports both development (long polling) and production (webhook) modes
- Idempotent request processing to prevent double-actions

- **Platform**: Cloudflare Workers
- **Runtime**: Bun / Edge Runtime
- **Framework**: grammY (core)
- **State Engine**: XState v5 (Domain Logic)
- **Environment**: T3 Env + Zod
- **Storage**: Upstash Redis

## Prerequisites

- Bun installed (v1.0.0+)
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- Bot must be admin in both:
  - Target channel (with permission to approve join requests)
  - Admin review group (with permission to post messages)

## Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```
   Fill in the required variables (Bot Token, Chat IDs) in `.env`.
   
   **Persistence:** Use Upstash Redis (`UPSTASH_*` variables) for production state persistence. Without it, the bot uses in-memory storage which resets on restart.

## Development Mode

Run the bot with long polling (automatically deletes webhook first):

```bash
bun run dev
```

This will:
- Delete any active webhook
- Start long polling to receive updates
- Enable hot reload on file changes

## Production Mode (Cloudflare Workers)

### 1. Configure Cloudflare

The bot is configured to run as a Cloudflare Worker using the entry point at `src/worker.ts`.

### 2. Set Environment Variables in Cloudflare

### 2. Set Environment Variables in Cloudflare

Ensure all production variables defined in `.env.example` are set in your Cloudflare Worker environment.

### 3. Deploy

```bash
bun run deploy
```

### 4. Set Webhook

After deployment, register your Worker URL with Telegram:

```bash
bun run webhook:setup
```

## Environment Variables

See `.env.example` for the complete list of available configuration options.

## Workflow

1. User requests to join the private channel
2. Bot sends DM asking for a reason
3. User replies with their reason
4. Bot posts a review card to the admin group
5. Admin clicks Approve or Decline
6. Bot verifies admin is authorized (must be admin in both chats)
7. Bot processes the request and updates the review card
8. User is notified of the decision

## Scripts

- `bun run dev`: Start development mode (long polling)
- `bun run deploy`: Deploy to Cloudflare Workers
- `bun run test`: Run the test suite
- `bun run webhook:setup`: Set production webhook
- `bun run webhook:get`: Fetch current webhook status
- `bun run webhook:test`: Simulate a webhook call

## Project Structure

```
.
├── src/
│   ├── bot.ts              # Core bot initialization
│   ├── dev.ts              # Local long polling entry point
│   ├── worker.ts           # Cloudflare Worker entry point
│   ├── env.ts              # Resilient environment validation
│   ├── types.ts            # TypeScript types
│   ├── handlers/          # Event handlers
│   │   ├── joinRequest.ts
│   │   ├── callbacks.ts
│   │   └── errors.ts
│   ├── repositories/      # Data access
│   │   └── JoinRequestRepository.ts
│   ├── scripts/           # Management scripts
│   │   └── webhook.ts     # Unified webhook management
│   └── services/          # Business logic
│       ├── authz.ts
│       ├── reviewCard.ts
│       └── state.ts
├── wrangler.jsonc         # Cloudflare configuration
├── package.json
├── tsconfig.json
└── bunfig.toml
```

## License

MIT
