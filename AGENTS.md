# Architecture & Patterns

## Core Stack

- **Platform**: Cloudflare Workers (Edge)
- **Framework**: grammY (Stateless mode)
- **State Logic**: XState v5 (Domain-driven)
- **Storage**: Cloudflare D1 (SQLite)
- **Runtime**: Bun (Local Dev & Tests)
- **Code Quality**: Biome (Linter & Formatter)

## Key Technical Patterns

### Configuration & Dependency Injection

Environment variables are validated via `arktype` in `src/env.ts` and mapped to a `BotConfig` object. The application uses a Formal DI pattern to manage dependencies and configuration without global state side-effects:
- `BotConfig`: Centralized type-safe configuration object.
- `BotContext`: GrammY context extended with `config` and `repo` (JoinRequestRepository).
- **Wiring**: Dependencies are instantiated in entry points (`worker.ts`, `dev.ts`) and injected into the bot instance and context middleware.
- **Environment Loading**: Bun automatically loads `.env` files into `process.env`. Do NOT add `import "dotenv/config"` to scripts - it's unnecessary and redundant.

### Statelessness & State Hydration

Local memory/sessions are **not** used. All state is hydrated from D1 per-request:
1. Fetch `userId` or `requestId` from the incoming Update.
2. Load the persisted state from D1 via `JoinRequestRepository`.
3. Hydrate a `JoinRequest` domain instance (which manages the XState machine).
4. Apply logic/transitions.
5. Persist the updated state back to D1.

### Testing & Fixtures

The project uses `bun test`. To ensure consistency and reduce duplication:
- **Centralized Fixtures**: Use `src/test-fixtures.ts` for mock configurations, request inputs, and standard mock objects.
- **Stateless Tests**: Tests should not rely on external services; use the provided mocks in the repository or service constructors.

## Code Quality Standards

- **Linting/Formatting**: Run `bun lint` or `bun format` (powered by Biome).
- **Pre-commit**: Hooks are configured to run Biome checks automatically before every commit.
- **Types**: Avoid `any` where possible. Use explicit types or `unknown` with type guards.
