import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

// Checks the constraints in migrations/ that sync and reminders rely on,
// against the local D1 the test setup migrates. Ported from PR #2.

const db = () => env.DB;
const run = (sql: string, ...values: unknown[]) => db().prepare(sql).bind(...values).run();

beforeEach(async () => {
  await db().batch([
    ...["completion", "device", "task", "list_member", "list", "user"].map((t) => db().prepare(`DELETE FROM ${t}`)),
    db().prepare(
      "INSERT INTO user (id, email, display_name, time_zone, created_at, updated_at) VALUES ('u1', 'a@example.com', 'A', 'UTC', 0, 0)",
    ),
    db().prepare("INSERT INTO list (id, name, owner_id, revision, created_at, updated_at) VALUES ('l1', 'Home', 'u1', 1, 0, 0)"),
    db().prepare(
      "INSERT INTO task (id, list_id, title, time_zone, created_by, revision, created_at, updated_at) VALUES ('t1', 'l1', 'Bins', 'UTC', 'u1', 2, 0, 0)",
    ),
  ]);
});

function insertTask(cols: Record<string, unknown>) {
  const base = { id: "t9", list_id: "l1", title: "x", time_zone: "UTC", created_by: "u1", revision: 5, created_at: 0, updated_at: 0 };
  const all = { ...base, ...cols };
  const names = Object.keys(all);
  return run(`INSERT INTO task (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`, ...Object.values(all));
}

describe("schema", () => {
  it("seeds the revision counter at 0", async () => {
    expect(await db().prepare("SELECT id, revision FROM counter").all()).toMatchObject({ results: [{ id: 1, revision: 0 }] });
  });

  it("emails are unique ignoring case", async () => {
    await expect(
      run("INSERT INTO user (id, email, display_name, time_zone, created_at, updated_at) VALUES ('u2', 'A@Example.com', 'B', 'UTC', 0, 0)"),
    ).rejects.toThrow(/UNIQUE/);
  });

  it("rejects a second completion of the same occurrence, so replays are harmless", async () => {
    const add = (id: string) =>
      run("INSERT INTO completion (id, task_id, occurrence_due, completed_by, completed_at) VALUES (?, 't1', '2026-10-30', 'u1', 0)", id);
    await add("c1");
    await expect(add("c2")).rejects.toThrow(/UNIQUE/);
  });

  it("a list member needs a user or an invited email, and roles are limited", async () => {
    const member = (id: string, email: string | null, role: string) =>
      run(
        "INSERT INTO list_member (id, list_id, invited_email, role, revision, created_at, updated_at) VALUES (?, 'l1', ?, ?, 3, 0, 0)",
        id,
        email,
        role,
      );
    await expect(member("m1", null, "editor")).rejects.toThrow(/CHECK/);
    await expect(member("m2", "b@example.com", "admin")).rejects.toThrow(/CHECK/);
    await member("m3", "b@example.com", "editor");
    await expect(member("m4", "B@EXAMPLE.COM", "viewer")).rejects.toThrow(/UNIQUE/);
  });

  it.each([
    ["a time without a date", { due_time: "09:00" }],
    ["a badly shaped date", { due_date: "tomorrow" }],
    ["a badly shaped time", { due_date: "2026-10-31", due_time: "9am" }],
    ["a repeat rule that is not JSON", { due_date: "2026-10-31", anchor_date: "2026-10-31", repeat_rule: "not json" }],
    ["a repeat rule without an anchor", { due_date: "2026-10-31", repeat_rule: "{}" }],
    ["an unknown status", { status: "done" }],
  ])("rejects a task with %s", async (_name, cols) => {
    await expect(insertTask(cols)).rejects.toThrow(/CHECK/);
  });

  it("accepts a well-formed repeating task", async () => {
    await insertTask({
      due_date: "2026-10-31",
      due_time: "09:00",
      anchor_date: "2026-10-31",
      repeat_rule: JSON.stringify({ kind: "weekly", every: 1, days: ["MO"] }),
    });
  });

  it("the reminder query uses the partial index, not a table scan", async () => {
    const { results } = await db()
      .prepare(
        `EXPLAIN QUERY PLAN SELECT id FROM task
         WHERE status = 'open' AND deleted = 0 AND next_reminder_at IS NOT NULL AND next_reminder_at <= ?
         ORDER BY next_reminder_at LIMIT 100`,
      )
      .bind(Date.now())
      .all<{ detail: string }>();
    const plan = results.map((r) => r.detail).join("\n");
    expect(plan).toMatch(/task_due_reminders/);
    expect(plan).not.toMatch(/SCAN task(?! USING)/);
  });

  it("enforces foreign keys", async () => {
    await expect(
      run("INSERT INTO list (id, name, owner_id, revision, created_at, updated_at) VALUES ('l2', 'n', 'nobody', 1, 0, 0)"),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});
