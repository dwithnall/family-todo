-- Initial schema. See docs/aidlc/spec.md, "Data model".
-- Times are UTC milliseconds since the epoch. Calendar dates are 'YYYY-MM-DD'
-- and wall-clock times are 'HH:MM', both in the task's time zone.
-- Rows that other devices must learn about are flagged deleted, never removed.

CREATE TABLE user (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name          TEXT NOT NULL,
  time_zone             TEXT NOT NULL,
  default_reminder_time TEXT NOT NULL DEFAULT '09:00',
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE list (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   TEXT NOT NULL REFERENCES user(id),
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  deleted    INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  revision   INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX list_by_revision ON list (revision);

-- A member is either a known user or an email invited before first sign-in.
CREATE TABLE list_member (
  id            TEXT PRIMARY KEY,
  list_id       TEXT NOT NULL REFERENCES list(id),
  user_id       TEXT REFERENCES user(id),
  invited_email TEXT COLLATE NOCASE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  deleted       INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  revision      INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL)
);
CREATE UNIQUE INDEX list_member_user ON list_member (list_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX list_member_invite ON list_member (list_id, invited_email) WHERE invited_email IS NOT NULL;
CREATE INDEX list_member_by_user ON list_member (user_id);
CREATE INDEX list_member_by_email ON list_member (invited_email);
CREATE INDEX list_member_by_revision ON list_member (list_id, revision);

CREATE TABLE task (
  id                       TEXT PRIMARY KEY,
  list_id                  TEXT NOT NULL REFERENCES list(id),
  title                    TEXT NOT NULL,
  notes                    TEXT NOT NULL DEFAULT '',
  due_date                 TEXT,
  due_time                 TEXT,
  time_zone                TEXT NOT NULL,
  repeat_rule              TEXT,              -- JSON, see packages/recurrence
  anchor_date              TEXT,
  occurrence               INTEGER NOT NULL DEFAULT 1, -- position in the series, for count ends
  reminder_offset_minutes  INTEGER,           -- null: no reminder; 0: at the due time
  status                   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  completed_at             INTEGER,
  next_reminder_at         INTEGER,
  last_reminded_occurrence TEXT,
  assignee_id              TEXT REFERENCES user(id),
  created_by               TEXT NOT NULL REFERENCES user(id),
  deleted                  INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  revision                 INTEGER NOT NULL,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  CHECK (due_time IS NULL OR due_date IS NOT NULL),
  CHECK (repeat_rule IS NULL OR (due_date IS NOT NULL AND anchor_date IS NOT NULL)),
  CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  CHECK (anchor_date IS NULL OR anchor_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  CHECK (due_time IS NULL OR due_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  CHECK (repeat_rule IS NULL OR json_valid(repeat_rule))
);
CREATE INDEX task_by_list_revision ON task (list_id, revision);
-- The per-minute reminder query reads only due rows through this index.
CREATE INDEX task_due_reminders ON task (next_reminder_at)
  WHERE next_reminder_at IS NOT NULL AND status = 'open' AND deleted = 0;

CREATE TABLE completion (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES task(id),
  occurrence_due TEXT,                        -- null for an undated task
  completed_by   TEXT NOT NULL REFERENCES user(id),
  completed_at   INTEGER NOT NULL
);
CREATE INDEX completion_by_task ON completion (task_id, completed_at);
-- One completion per occurrence makes duplicate taps and offline replays harmless.
CREATE UNIQUE INDEX completion_once ON completion (task_id, occurrence_due) WHERE occurrence_due IS NOT NULL;

CREATE TABLE device (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES user(id),
  kind          TEXT NOT NULL CHECK (kind IN ('web_push', 'widget')),
  push_endpoint TEXT,                         -- web_push only
  push_keys     TEXT,                         -- web_push only: JSON {p256dh, auth}
  token_hash    TEXT,                         -- widget only: SHA-256 of the token
  label         TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER,
  revoked_at    INTEGER,
  CHECK (
    (kind = 'web_push' AND push_endpoint IS NOT NULL) OR
    (kind = 'widget' AND token_hash IS NOT NULL)
  )
);
CREATE INDEX device_by_user ON device (user_id);
CREATE UNIQUE INDEX device_push_endpoint ON device (push_endpoint) WHERE push_endpoint IS NOT NULL;
CREATE UNIQUE INDEX device_token_hash ON device (token_hash) WHERE token_hash IS NOT NULL;

-- One row holding the global revision number used by sync.
CREATE TABLE counter (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL
);
INSERT INTO counter (id, revision) VALUES (1, 0);
