# family-todo

A private, installable (PWA) to-do app for fewer than 10 people, hosted on Cloudflare.

- One-off tasks (no date, or a set date and time)
- Repeating tasks: by day of week, month or year, or X days/weeks/months after the last completion
- Individual accounts and lists that can be shared
- Android first, with a home screen widget planned as a small native companion app

Status: Bolt 1 built (foundation and access, recurrence engine). See [docs/aidlc/plans/bolt-1.md](docs/aidlc/plans/bolt-1.md) for what is done and the Cloudflare setup still needed, and [docs/aidlc/decisions.md](docs/aidlc/decisions.md) for decisions made while building.

The full specification, written with the AI-DLC (AI-Driven Development Life Cycle) framework, is in [docs/aidlc/spec.md](docs/aidlc/spec.md). It covers requirements, user stories, application design, units of work, test plan and operations, and ends with open questions that need answers before building starts.

## Development

Needs Node 22 and pnpm.

```bash
pnpm install
```

```bash
pnpm test
```

```bash
pnpm typecheck
```
