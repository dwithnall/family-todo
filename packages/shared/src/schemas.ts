import { isTimeString, isValidTimeZone } from "@family-todo/recurrence";
import { z } from "zod";

export const timeZoneSchema = z.string().refine(isValidTimeZone, "Unknown time zone");
export const timeSchema = z.string().refine(isTimeString, "Use 24-hour HH:MM");

/** The signed-in person, as returned by GET /api/me. */
export interface Me {
  id: string;
  email: string;
  displayName: string;
  timeZone: string;
  defaultReminderTime: string;
}

/** PATCH /api/me. */
export const updateMeSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(80).optional(),
    timeZone: timeZoneSchema.optional(),
    defaultReminderTime: timeSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateMe = z.infer<typeof updateMeSchema>;

export interface ApiError {
  error: { code: string; message: string };
}

/** Header every write request must carry (spec NFR design, browser safety). */
export const WRITE_HEADER = "X-Family-Todo";
