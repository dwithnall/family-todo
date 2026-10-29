import { uuidv7, type Me, type UpdateMe } from "@family-todo/shared";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  time_zone: string;
  default_reminder_time: string;
}

const COLUMNS = "id, email, display_name, time_zone, default_reminder_time";

function toMe(row: UserRow): Me {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    timeZone: row.time_zone,
    defaultReminderTime: row.default_reminder_time,
  };
}

export async function findUserByEmail(db: D1Database, email: string): Promise<Me | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM user WHERE email = ?`).bind(email).first<UserRow>();
  return row ? toMe(row) : null;
}

/**
 * Returns the account for a verified email, creating it on first sign-in.
 * Safe when two first requests race: the insert is a no-op for the loser.
 */
export async function getOrCreateUser(
  db: D1Database,
  email: string,
  defaults: { timeZone: string },
  now: number = Date.now(),
): Promise<Me> {
  const existing = await findUserByEmail(db, email);
  if (existing) return existing;

  const displayName = email.split("@")[0] || email;
  await db
    .prepare(
      `INSERT INTO user (id, email, display_name, time_zone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (email) DO NOTHING`,
    )
    .bind(uuidv7(now), email, displayName, defaults.timeZone, now, now)
    .run();

  const created = await findUserByEmail(db, email);
  if (!created) throw new Error("user insert failed");
  return created;
}

export async function updateUser(db: D1Database, id: string, patch: UpdateMe, now: number = Date.now()): Promise<Me> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.displayName !== undefined) (sets.push("display_name = ?"), values.push(patch.displayName));
  if (patch.timeZone !== undefined) (sets.push("time_zone = ?"), values.push(patch.timeZone));
  if (patch.defaultReminderTime !== undefined) (sets.push("default_reminder_time = ?"), values.push(patch.defaultReminderTime));
  const row = await db
    .prepare(`UPDATE user SET ${sets.join(", ")}, updated_at = ? WHERE id = ? RETURNING ${COLUMNS}`)
    .bind(...values, now, id)
    .first<UserRow>();
  if (!row) throw new Error("user not found");
  return toMe(row);
}
