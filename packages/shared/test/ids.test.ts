import { describe, expect, it } from "vitest";
import { isUuid, updateMeSchema, uuidv7 } from "../src/index.js";

describe("uuidv7", () => {
  it("is a valid version 7 UUID that sorts by time", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe("7");
    expect("89ab").toContain(a[19]);
    expect(a < b).toBe(true);
    expect(a.slice(0, 13)).toBe("018bcfe5-6800");
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(ids.size).toBe(1000);
  });
});

describe("updateMeSchema", () => {
  it("accepts valid fields and rejects bad ones", () => {
    expect(updateMeSchema.safeParse({ timeZone: "Australia/Brisbane", defaultReminderTime: "07:30" }).success).toBe(true);
    expect(updateMeSchema.safeParse({}).success).toBe(false);
    expect(updateMeSchema.safeParse({ timeZone: "Nowhere/Land" }).success).toBe(false);
    expect(updateMeSchema.safeParse({ defaultReminderTime: "7:30" }).success).toBe(false);
    expect(updateMeSchema.safeParse({ displayName: "   " }).success).toBe(false);
    expect(updateMeSchema.safeParse({ email: "x@y.z" }).success).toBe(false);
  });
});
