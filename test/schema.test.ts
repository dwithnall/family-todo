import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';

// Applies every migration, in order, to a throwaway in-memory SQLite database (D1 is SQLite)
// and checks the constraints the sync design relies on.

const dir = new URL('../migrations/', import.meta.url);

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const files = readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
  for (const f of files) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  return db;
}

function seed(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO user (id, email, display_name, created_at) VALUES ('u1', 'a@example.com', 'A', '2026-10-30T00:00:00Z');
    INSERT INTO list (id, name, owner_id, revision, created_at) VALUES ('l1', 'Home', 'u1', 1, '2026-10-30T00:00:00Z');
    INSERT INTO task (id, list_id, title, revision, created_at) VALUES ('t1', 'l1', 'Bins', 2, '2026-10-30T00:00:00Z');
  `);
}

describe('schema', () => {
  it('applies cleanly and seeds the revision counter at 0', () => {
    const db = freshDb();
    assert.deepEqual({ ...db.prepare('SELECT id, value FROM counter').get() }, { id: 1, value: 0 });
  });

  it('emails are unique ignoring case', () => {
    const db = freshDb();
    seed(db);
    assert.throws(() =>
      db.exec(`INSERT INTO user (id, email, display_name, created_at) VALUES ('u2', 'A@Example.com', 'B', 'x')`),
    );
  });

  it('a second completion of the same occurrence is rejected, so replays are harmless', () => {
    const db = freshDb();
    seed(db);
    const add = (id: string) =>
      db.exec(`INSERT INTO completion (id, task_id, occurrence_date, completed_by, completed_at)
               VALUES ('${id}', 't1', '2026-10-30', 'u1', '2026-10-30T01:00:00Z')`);
    add('c1');
    assert.throws(() => add('c2'));
  });

  it('a list member needs a user or an invited email, and roles are limited', () => {
    const db = freshDb();
    seed(db);
    assert.throws(() => db.exec(`INSERT INTO list_member (list_id, role, revision) VALUES ('l1', 'editor', 3)`));
    assert.throws(() =>
      db.exec(`INSERT INTO list_member (list_id, invited_email, role, revision) VALUES ('l1', 'b@example.com', 'admin', 3)`),
    );
    db.exec(`INSERT INTO list_member (list_id, invited_email, role, revision) VALUES ('l1', 'b@example.com', 'editor', 3)`);
    assert.throws(() =>
      db.exec(`INSERT INTO list_member (list_id, invited_email, role, revision) VALUES ('l1', 'B@EXAMPLE.COM', 'viewer', 4)`),
    );
  });

  it('task constraints: a time needs a date, dates are shaped, repeat rule must be JSON', () => {
    const db = freshDb();
    seed(db);
    const insert = (cols: string, vals: string) =>
      db.exec(`INSERT INTO task (id, list_id, title, revision, created_at, ${cols}) VALUES ('t9', 'l1', 'x', 5, 'x', ${vals})`);
    assert.throws(() => insert('due_time', `'09:00'`));
    assert.throws(() => insert('due_date', `'tomorrow'`));
    assert.throws(() => insert('repeat_rule', `'not json'`));
    insert('due_date, due_time, repeat_rule', `'2026-10-31', '09:00', '{"kind":"weekly","every":1,"days":["MO"]}'`);
  });

  it('the reminder query uses the partial index, not a table scan', () => {
    const db = freshDb();
    seed(db);
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT id FROM task
         WHERE status = 'open' AND deleted = 0 AND next_reminder_at IS NOT NULL AND next_reminder_at <= ?
         ORDER BY next_reminder_at LIMIT 100`,
      )
      .all('2026-10-30T00:00:00Z')
      .map((r) => String((r as { detail: string }).detail))
      .join('\n');
    assert.match(plan, /task_open_by_reminder/);
    assert.doesNotMatch(plan, /SCAN task(?! USING)/);
  });

  it('foreign keys are enforced', () => {
    const db = freshDb();
    assert.throws(() => db.exec(`INSERT INTO list (id, name, owner_id, revision, created_at) VALUES ('l', 'n', 'nobody', 1, 'x')`));
  });
});
