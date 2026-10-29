-- Initial schema, from the data model in docs/aidlc/spec.md.
-- Ids are client-generated, time-sortable UUIDs (text). Deletes are flagged, never removed,
-- so other devices learn about them through sync.

CREATE TABLE user (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name          TEXT NOT NULL,
  time_zone             TEXT NOT NULL DEFAULT 'UTC',
  default_reminder_time TEXT NOT NULL DEFAULT '09:00' CHECK (default_reminder_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  created_at            TEXT NOT NULL
);

CREATE TABLE list (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   TEXT NOT NULL REFERENCES user (id),
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  deleted    INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  revision   INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX list_by_revision ON list (revision);

-- A member is either a signed-in user or an invited email that has not signed in yet.
CREATE TABLE list_member (
  list_id       TEXT NOT NULL REFERENCES list (id),
  user_id       TEXT REFERENCES user (id),
  invited_email TEXT COLLATE NOCASE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  revision      INTEGER NOT NULL,
  removed       INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1)),
  CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL)
);
CREATE UNIQUE INDEX list_member_user ON list_member (list_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX list_member_invite ON list_member (list_id, invited_email) WHERE invited_email IS NOT NULL;
CREATE INDEX list_member_by_user ON list_member (user_id);

CREATE TABLE task (
  id                       TEXT PRIMARY KEY,
  list_id                  TEXT NOT NULL REFERENCES list (id),
  title                    TEXT NOT NULL,
  notes                    TEXT NOT NULL DEFAULT '',
  due_date                 TEXT CHECK (due_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  due_time                 TEXT CHECK (due_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  time_zone                TEXT NOT NULL DEFAULT 'UTC',
  repeat_rule              TEXT CHECK (repeat_rule IS NULL OR json_valid(repeat_rule)),
  anchor_date              TEXT,
  status                   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  next_reminder_at         TEXT, -- UTC, ISO 8601
  last_reminded_occurrence TEXT,
  assignee_id              TEXT REFERENCES user (id),
  revision                 INTEGER NOT NULL,
  deleted                  INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  created_at               TEXT NOT NULL,
  CHECK (due_time IS NULL OR due_date IS NOT NULL)
);
CREATE INDEX task_by_list_revision ON task (list_id, revision);
-- The every-minute reminder query reads only this small partial index, never the whole table.
CREATE INDEX task_open_by_reminder ON task (next_reminder_at)
  WHERE status = 'open' AND deleted = 0 AND next_reminder_at IS NOT NULL;

CREATE TABLE completion (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES task (id),
  occurrence_date TEXT,
  completed_by    TEXT NOT NULL REFERENCES user (id),
  completed_at    TEXT NOT NULL
);
-- One completion per occurrence: this is what makes a duplicate or replayed completion harmless.
CREATE UNIQUE INDEX completion_per_occurrence ON completion (task_id, occurrence_date);

CREATE TABLE device (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES user (id),
  kind       TEXT NOT NULL CHECK (kind IN ('web_push', 'widget')),
  endpoint   TEXT, -- push endpoint, or a hash of the widget token (never the token itself)
  last_seen  TEXT,
  revoked    INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
);
CREATE INDEX device_by_user ON device (user_id);

-- A single row holding the global revision number that sync cursors compare against.
CREATE TABLE counter (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  value INTEGER NOT NULL
);
INSERT INTO counter (id, value) VALUES (1, 0);
