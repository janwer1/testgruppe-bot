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

## Production Mode (Vercel)

### 1. Deploy to Vercel

The bot includes a Vercel serverless function handler at `api/telegram.ts`.

### 2. Set Environment Variables in Vercel

Add all required environment variables in Vercel dashboard:
- `MODE=prod`
- `BOT_TOKEN`
- `TARGET_CHAT_ID`
- `ADMIN_REVIEW_CHAT_ID`
- `PUBLIC_BASE_URL` (your Vercel app URL)
- `WEBHOOK_PATH=/api/telegram`
- `WEBHOOK_SECRET_TOKEN` (random secure string)

### 3. Set Webhook

After deployment, run the webhook setup script:

```bash
bun run webhook-setup
```

This will configure Telegram to send updates to your Vercel function.

## Environment Variables

### Required (both modes)
- `MODE`: `dev` or `prod`
- `BOT_TOKEN`: Telegram bot token
- `TARGET_CHAT_ID`: Target channel ID (negative number)
- `ADMIN_REVIEW_CHAT_ID`: Admin review group ID (negative number)
- `LOG_LEVEL`: `debug`, `info`, `warn`, or `error` (default: `info`)

### Required (prod only)
- `PUBLIC_BASE_URL`: Your Vercel app URL (e.g., `https://your-app.vercel.app`)
- `WEBHOOK_PATH`: Webhook path (e.g., `/api/telegram`)
- `WEBHOOK_SECRET_TOKEN`: Random secret token for webhook validation

### Optional
- `REASON_TTL_SECONDS`: Time-to-live for request state (default: `604800` = 7 days)
- `MAX_REASON_LENGTH`: Maximum reason text length (default: `500`)
- `TIMEZONE`: Timezone for date formatting (default: `Europe/Berlin`)
- `DROP_PENDING_UPDATES_ON_DEV_START`: Drop pending updates when starting dev mode (default: `false`)
- `UPSTASH_REDIS_REST_URL`: Upstash Redis REST API URL (optional, recommended for production)
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST API token (optional, recommended for production)
- `JOIN_LINK`: Join link for the target channel/group (optional, used in error messages when requests are missing)

**Note:** If Redis is not configured, the bot will use in-memory storage (data lost on restart). For production, configure Upstash Redis for persistent state across restarts.

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

- `bun run dev`: Start development server with hot reload
- `bun run start`: Start production server
- `bun run build`: Compile TypeScript
- `bun run type-check`: Type check without compilation
- `bun run webhook-setup`: Set webhook for production mode

## Project Structure

```
.
├── src/
│   ├── bot.ts              # Bot initialization
│   ├── dev.ts              # Development entry point
│   ├── vercel.ts           # Production webhook handler
│   ├── webhook-setup.ts    # Webhook configuration script
│   ├── env.ts              # Environment validation
│   ├── types.ts            # TypeScript types
│   ├── handlers/          # Event handlers
│   │   ├── joinRequest.ts
│   │   ├── callbacks.ts
│   │   └── errors.ts
│   ├── conversations/      # Conversation flows
│   │   └── collectReason.ts
│   └── services/          # Business logic
│       ├── authz.ts
│       ├── reviewCard.ts
│       └── state.ts
├── api/
│   └── telegram.ts        # Vercel API route
├── package.json
├── tsconfig.json
└── bunfig.toml
```

## License

MIT
