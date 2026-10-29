# Bolt 1: U1 Foundation and access, U2 Recurrence engine

Status: code and tests done. Waiting on you for approval gate 2 and for the Cloudflare setup below.

## What was built

**U2, recurrence engine** (`packages/recurrence`)

- Rule types and validation for weekly, monthly on a day, monthly on the Nth weekday, yearly, and after completion, with optional `until` or `count` ends.
- `firstDue`, `nextDue`, `skipOccurrence` and `occurrencesBetween` (for Upcoming). All pure: today's date is always passed in.
- `toInstant`, `toLocal` and `todayIn` for time zones, including daylight saving gaps and overlaps.
- 57 tests: every row of the spec's example table, month ends, leap years (including 2100), Nth weekday, every-N alignment, ends, validation, daylight saving in New York, Sydney and Lord Howe Island, and property checks over 2,000 random rules.

**U1, foundation and access** (`apps/api`, `packages/shared`, `migrations`)

- pnpm workspace in the spec's layout, strict TypeScript.
- D1 schema for every table in the data model, with the indexes the NFR design asks for, including the partial index the per-minute reminder query will use.
- Worker on Hono. Every `/api/*` call verifies the Access token (signature, expiry, issuer, audience), requires `X-Family-Todo: 1` on writes, and creates the account on first sign-in.
- `GET /api/me` and `PATCH /api/me`.
- 23 API tests running in the Workers runtime with a local D1, including the identity negative tests: missing, garbage, wrong key, wrong audience, wrong issuer, expired, no email, unsigned, and an email header with no token.
- GitHub Actions: type check and tests on every push and pull request; deploy on main once you turn it on.

New decisions are in [decisions.md](../decisions.md). D-7 (daylight saving gap) is the one to check.

## Gate 2: your review of the recurrence engine

Read `packages/recurrence/test/engine.test.ts` and `zoned.test.ts`. The `describe` names map to the requirements (FR-5 to FR-12). Say if any expected date looks wrong to you.

## Cloudflare setup (needed before the first deploy)

These need your Cloudflare account, so they were not done here. The answer to spec question Q1 (do you have a domain on Cloudflare?) decides the hostname.

1. Create the databases and paste each printed id into `apps/api/wrangler.jsonc`:

   ```bash
   pnpm --filter @family-todo/api exec wrangler d1 create family-todo
   ```

   ```bash
   pnpm --filter @family-todo/api exec wrangler d1 create family-todo-preview
   ```

2. In Cloudflare Zero Trust, add one-time PIN as a login method, then create a self-hosted Access application for the app's hostname with an Allow policy listing the approved emails. Set the session duration to about a month.
3. Copy the team domain (`https://<team>.cloudflareaccess.com`) and the application's AUD tag into `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.jsonc`. Neither is secret.
4. Add a route or custom domain for the Worker on that hostname.
5. In GitHub, add secrets `CLOUDFLARE_API_TOKEN` (Workers and D1 edit rights) and `CLOUDFLARE_ACCOUNT_ID`, then set the repository variable `DEPLOY_ENABLED` to `true`. Pushes to main will then apply migrations and deploy.

## Running it locally

```bash
pnpm install
```

```bash
pnpm test
```

```bash
pnpm typecheck
```

## Next: Bolt 2 (U3 tasks, lists and sync)

Task and list operations, the revision counter, `GET /api/sync` and `POST /api/sync/push`, role checks, completion history and undo, plus the client outbox and IndexedDB store. It builds on both units here.
