# family-todo

A private, installable (PWA) to-do app for fewer than 10 people, hosted on Cloudflare.

- One-off tasks (no date, or a set date and time)
- Repeating tasks: by day of week, month or year, or X days/weeks/months after the last completion
- Individual accounts and lists that can be shared
- Android first, with a home screen widget planned as a small native companion app

Status: Bolt 1 in progress. The recurrence engine (U2) and the database schema are built and tested. The Worker, sync and UI are not started.

The full specification, written with the AI-DLC (AI-Driven Development Life Cycle) framework, is in [docs/aidlc/spec.md](docs/aidlc/spec.md). It covers requirements, user stories, application design, units of work, test plan and operations, and ends with open questions that need answers before building starts. Build decisions are logged in [docs/aidlc/decisions.md](docs/aidlc/decisions.md).

## Layout

```
packages/recurrence  next-occurrence engine (no dependencies)
migrations/          D1 SQL migrations
test/                schema tests
docs/aidlc/          spec and decisions
```

## Running the tests

Needs Node 22.18 or newer. No install is needed for the current code.

```
npm test
```
