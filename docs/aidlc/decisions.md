# Decisions log

Newest last. Each entry says what was decided, why, and what it changes.

## 2026-10-30: Bolt 1 build choices

**Recurrence engine works on plain calendar dates.** `nextDue(rule, input)` takes and returns `YYYY-MM-DD` strings. The spec sketched `nextDue(rule, currentDue, completedOn, timeZone)`; the time zone parameter is gone because pure date arithmetic does not need one. Time zones are handled by two separate helpers, `civilDateInZone(instant, zone)` ("what is today for this person") and `resolveLocalTime(date, "HH:mm", zone)` (the instant for a reminder). The anchor date and completed count are passed in an options object because they are task fields, not part of the rule JSON.

**Rule shape additions.** `monthly_day.day` accepts `'last'` (FR-7, last day of month). `monthly_nth.nth` accepts `1` to `4` or `'last'`. Any rule may carry `end: { until, count }` (FR-12). A skipped occurrence counts toward `end.count`.

**Daylight saving gaps.** A wall-clock time that does not exist resolves to the moment the clocks jump (02:30 on a spring-forward day becomes 03:00). A time that happens twice resolves to the first occurrence. Both are covered by tests in New York and Sydney.

**Zero dependencies, Node's built-in test runner.** The npm registry was blocked in the session that built Bolt 1, so the engine and its tests use only Node 22.18+ (type stripping, `node:test`, `node:sqlite`) and need no install. The spec names Vitest; porting the tests is a find-and-replace on the imports and can be done when the Worker work brings Vitest in. The engine itself is unaffected.

**Schema checked against real SQLite.** `test/schema.test.ts` applies every migration to an in-memory SQLite database (D1 is SQLite) and checks the constraints sync relies on: one completion per occurrence, case-insensitive unique emails, a members row needs a user or an invited email, and the reminder query uses the partial index.

**Default time zone is UTC.** New users get `UTC` until they set their own; the app should prompt on first sign-in.

**Not started (blocked on npm access): the Worker half of U1.** Hono app, Access token verification (`jose`), `GET /api/me`, identity negative tests, `wrangler.jsonc`, and the deploy pipeline. The CI workflow in this branch runs typecheck and tests only; it does not deploy.
