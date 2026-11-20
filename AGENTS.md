# AGENTS.md — Guidelines for AI Coding Agents in `edge-funnel`

## Architecture & Scope
- `edge-funnel` is a 100% serverless First-Party Content Attribution & Same-Age Cohort (`D+1`/`D+3`/`D+7`) Analytics Engine running on **Cloudflare Workers + Hono + TypeScript + D1 + Cron Triggers**.
- No browser automation or scraping dependencies exist here (`SAIF 10-Gate Productization Filter / ZK-032`). All telemetry comes from first-party smart redirects (`/r/:code`), the `<2KB` attribution pixel (`/ef.js`), HMAC-authenticated webhooks, and the 2-endpoint read-only Pull Contract (`/ef/signups` & `/ef/orders`).

## Port & Local Development Rules
- Default local dev port is **`:8792`** (`127.0.0.1:8792`, inspector `:9292`), configured in `wrangler.toml` and `package.json`.
- **Never** run `wrangler deploy` unless explicitly requested by the maintainer.
- Verify changes with:
  ```bash
  npm run typecheck
  npm test
  ```

## Code Quality Invariants
1. **Strict Multi-Tenant Isolation**: Every SQL query touching `episodes`, `shortlinks`, `touchpoints`, `metric_snapshots`, `conversions`, or `report_deliveries` MUST filter by `workspace_id = ?`.
2. **D1 Bind Safety**: Never pass `undefined` into `.bind(...)`. Always coalesce optional fields with `?? null`.
3. **Zero PII Persistence**: Hash raw IP + UA daily via `buildDailyVisitorHash()` and hash phone/email contacts via `buildCustomerHash()`.
4. **Constant-Time Webhook Verification**: Always hash exact raw request body (`await c.req.text()`) and verify via `constantTimeEqual()`.
5. **`/ef.js` Size Budget**: Keep `EF_JS_SNIPPET` strictly under `2048` bytes (`tests/isolation-and-edge.test.ts` enforces this).
