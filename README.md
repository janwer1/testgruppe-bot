# Telegram Join Request Bot

Production-ready Telegram bot that automates the join request review process for private channels using grammY, Bun, and TypeScript.

## Features

- Automatically detects join requests for private channels
- Collects user reasons via DM conversations
- Posts review cards to admin group with approve/decline buttons
- Verifies admin authorization before processing actions
- Supports both development (long polling) and production (webhook) modes
- Idempotent request processing to prevent double-actions

## Tech Stack

- **Runtime**: Bun (compatible with Node.js 24.x)
- **Language**: TypeScript (strict mode)
- **Framework**: grammY
- **Plugins**: @grammyjs/conversations, @grammyjs/session
- **Environment**: T3 Env with Zod validation

## Prerequisites

- Bun installed (v1.0.0+)
- Node.js 24.x (for Vercel deployment compatibility)
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- Bot must be admin in both:
  - Target channel (with permission to approve join requests)
  - Admin review group (with permission to post messages)

## Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables:**
   Edit `.env` and set:
   - `BOT_TOKEN`: Your Telegram bot token
   - `TARGET_CHAT_ID`: The private channel ID (negative number)
   - `ADMIN_REVIEW_CHAT_ID`: The admin review group ID (negative number)
   - `MODE`: `dev` for local development, `prod` for production

4. **Set up Upstash Redis (Recommended for Production):**
   - Create a free account at [Upstash](https://upstash.com/)
   - Create a new Redis database
   - Copy the REST URL and Token
   - Add to `.env`:
     ```
     UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
     UPSTASH_REDIS_REST_TOKEN=your-token-here
     ```
   
   **Note:** Without Redis, the bot uses in-memory storage (data is lost on restart). Redis enables persistent state across restarts and deployments.

## Development Mode

Run the bot with long polling (automatically deletes webhook first):

```bash
bun run dev
```

This will:
- Delete any active webhook
- Start long polling to receive updates
- Enable hot reload on file changes

### Debugging with Inspector

**Option 1: VS Code Debugger**

1. Start the bot with inspector:
   ```bash
   bun run dev:debug
   ```

2. In VS Code, go to Run and Debug (Cmd+Shift+D / Ctrl+Shift+D)
3. Select "Debug Bot (Bun)" configuration
4. Click the play button or press F5
5. Set breakpoints in your code and debug!

**Option 2: Chrome DevTools**

1. Start the bot with inspector:
   ```bash
   bun run dev:inspect
   ```

2. Open Chrome and navigate to: `chrome://inspect`
3. Click "Open dedicated DevTools for Node"
4. Set breakpoints and debug in the browser

**Option 3: Command Line Inspector**

```bash
# Start with inspector on port 9229 (default)
bun --inspect src/dev.ts

# Or with a custom port
bun --inspect=0.0.0.0:9230 src/dev.ts
```

Then connect using any Node.js debugger client.

## Production Mode (Cloudflare Workers)

### 1. Configure Cloudflare

The bot is configured to run as a Cloudflare Worker using the entry point at `src/worker.ts`.

### 2. Set Environment Variables in Cloudflare

You can push your local `.env` variables as secrets to Cloudflare in one go:

```bash
# Push all variables as secrets
while read -r line; do
  if [[ ! -z "$line" && "$line" != \#* ]]; then
    key=$(echo "$line" | cut -d '=' -f 1)
    value=$(echo "$line" | cut -d '=' -f 2-)
    value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//')
    echo "$value" | bunx wrangler secret put "$key"
  fi
done < .env
```

Required variables:
- `MODE=prod`
- `BOT_TOKEN`
- `TARGET_CHAT_ID`
- `ADMIN_REVIEW_CHAT_ID`
- `PUBLIC_BASE_URL` (e.g., `https://your-worker.your-subdomain.workers.dev`)
- `WEBHOOK_SECRET_TOKEN` (random secure string)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `JOIN_LINK`

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

### Required (both modes)
- `MODE`: `dev` or `prod`
- `BOT_TOKEN`: Telegram bot token
- `TARGET_CHAT_ID`: Target channel ID (negative number)
- `ADMIN_REVIEW_CHAT_ID`: Admin review group ID (negative number)
- `LOG_LEVEL`: `debug`, `info`, `warn`, or `error` (default: `info`)

### Required (prod only)
- `PUBLIC_BASE_URL`: Your Cloudflare Worker URL
- `WEBHOOK_PATH`: Webhook path (default: `/api/bot`)
- `WEBHOOK_SECRET_TOKEN`: Random secret token for webhook validation

### Optional
- `REASON_TTL_SECONDS`: Time-to-live for request state (default: `604800` = 7 days)
- `MAX_REASON_CHARS`: Maximum reason text characters (default: `500`)
- `MIN_REASON_WORDS`: Minimum number of words for reason (default: `15`)
- `TIMEZONE`: Timezone for date formatting (default: `Europe/Berlin`)
- `DROP_PENDING_UPDATES_ON_DEV_START`: Drop pending updates when starting dev mode (default: `false`)

**Note:** Upstash Redis is required for production persistent state.
- `UPSTASH_REDIS_REST_URL`: Upstash Redis REST API URL
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST API token
- `JOIN_LINK`: Join link for the target channel/group (required)

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

- `bun run dev`: Start development server (long polling) with hot reload
- `bun run start`: Start local development worker (wrangler dev)
- `bun run build`: Compile TypeScript
- `bun run type-check`: Type check without compilation
- `bun run deploy`: Deploy to Cloudflare Workers
- `bun run webhook:setup`: Set webhook for production
- `bun run webhook:test`: Simulate a webhook call locally or to prod

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
│   │   ├── setup-webhook.ts
│   │   └── test-webhook.ts
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
