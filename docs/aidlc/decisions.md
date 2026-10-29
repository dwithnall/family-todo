# Decisions log

Decisions made while building, in addition to D1 to D5 in the [spec](spec.md#decisions-for-you). Each one names the unit it came from. Items marked **Review** are worth a look at the next approval gate.

## Bolt 1 (U1, U2)

| # | Unit | Decision | Why |
| --- | --- | --- | --- |
| D-6 | U2 | The engine works only in calendar dates in the task's time zone. Converting between UTC instants and local time is a separate pair of functions, `toInstant` and `toLocal`. `nextDue` takes `{ rule, anchor }` and `{ currentDue, on, occurrence? }` instead of the spec's `(rule, currentDue, completedOn, timeZone)`. | The anchor is needed for "every 2 weeks", and keeping time zones out of date arithmetic makes the rules simple to test. |
| D-7 | U2 | **Review.** A due time that does not exist because clocks jump forward (02:30 when 02:00 becomes 03:00) moves to the moment the clocks change (03:00). A time that happens twice when clocks go back uses the first one. | The spec says "the next valid time that day". The common alternative (RFC 5545, JavaScript Temporal) would give 03:30. |
| D-8 | U2 | A `count` end counts each completion or skip. Occurrences jumped over because the task was late do not count. The task stores its position as `occurrence`. | Matches "missed occurrences are skipped, never stacked". |
| D-9 | U2 | "Last day of the month" (FR-7) is `monthly_day` with `day: 31`, since short months clamp to their last day. No separate rule kind. | One less rule type with the same result. |
| D-10 | U2 | Yearly rules accept an optional `every` (default 1). After-completion units are day, week and month, as FR-9 lists; no year. | Small, cheap generalization; year can be added later. |
| D-11 | U2 | `occurrencesBetween` projects after-completion rules forward as if each were done on its due date; the caller passes the current due date as the anchor. | The future of such a rule is unknown, but Upcoming still needs dates. |
| D-12 | U1 | Schema additions not in the spec's data model: `task.occurrence`, `task.reminder_offset_minutes` (FR-14), `device.push_keys`, `label` and `revoked_at`, and a unique index of one completion per task occurrence (idempotent completion, spec rule 4). | Needed by requirements the data model table did not spell out. |
| D-13 | U1 | The identity token is read only from the `Cf-Access-Jwt-Assertion` header, not the `CF_Authorization` cookie, and only RS256 is accepted. If `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is empty the API refuses every call. | Access always adds the header; failing closed avoids an open API after a config mistake. |
| D-14 | U1 | Write requests (anything but GET, HEAD, OPTIONS) must send `X-Family-Todo: 1`. | The spec's "required custom request header on writes". |
| D-15 | U1 | Added `PATCH /api/me` to set display name, time zone and default reminder time. New accounts start with the `DEFAULT_TIME_ZONE` variable (UTC if unset). | FR-17 needs these to be settable; the spec's API list had only `GET /api/me`. |
| D-16 | U1 | Tooling: pnpm workspaces, TypeScript 5.9, Vitest 4.1 and `@cloudflare/vitest-plugin` (the renamed `vitest-pool-workers`), which runs API tests inside the Workers runtime with a local D1. | TypeScript 7 and Vitest 5 are current, but the Workers test tooling and most editors are proven on these. Upgrade later. |
| D-17 | U1 | Deferred: claiming email invites on first sign-in (U5), static assets and the manifest-behind-Access check (U4), the cron trigger (U6) and R2 (U8). | Each belongs to its own unit; the schema already supports them. |
