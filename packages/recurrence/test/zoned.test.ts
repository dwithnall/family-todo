import { describe, expect, it } from "vitest";
import { isValidTimeZone, toInstant, toLocal, todayIn } from "../src/index.js";

const iso = (ms: number) => new Date(ms).toISOString();

describe("toInstant", () => {
  it("converts an ordinary local time", () => {
    expect(iso(toInstant("2026-10-29", "09:00", "Australia/Brisbane"))).toBe("2026-10-28T23:00:00.000Z");
    expect(iso(toInstant("2026-07-01", "12:30", "UTC"))).toBe("2026-07-01T12:30:00.000Z");
  });

  it("tracks the offset either side of a daylight saving change", () => {
    // Sydney moves to +11 on Sun Oct 4, 2026.
    expect(iso(toInstant("2026-10-03", "09:00", "Australia/Sydney"))).toBe("2026-10-02T23:00:00.000Z");
    expect(iso(toInstant("2026-10-05", "09:00", "Australia/Sydney"))).toBe("2026-10-04T22:00:00.000Z");
  });

  it("moves a time skipped by spring-forward to the moment clocks change", () => {
    // New York skips 02:00-03:00 on Sun Mar 14, 2027.
    expect(toLocal(toInstant("2027-03-14", "02:30", "America/New_York"), "America/New_York")).toEqual({
      date: "2027-03-14",
      time: "03:00",
    });
    expect(iso(toInstant("2027-03-14", "02:30", "America/New_York"))).toBe("2027-03-14T07:00:00.000Z");
    // Sydney skips 02:00-03:00 on Oct 4, 2026.
    expect(toLocal(toInstant("2026-10-04", "02:15", "Australia/Sydney"), "Australia/Sydney").time).toBe("03:00");
  });

  it("uses the first of two repeated times on fall-back", () => {
    // New York repeats 01:00-02:00 on Sun Nov 1, 2026: first at -4, then at -5.
    expect(iso(toInstant("2026-11-01", "01:30", "America/New_York"))).toBe("2026-11-01T05:30:00.000Z");
  });

  it("handles a half-hour daylight saving zone", () => {
    // Lord Howe Island shifts by 30 minutes, skipping 02:00-02:30 on Oct 4, 2026.
    expect(toLocal(toInstant("2026-10-04", "02:10", "Australia/Lord_Howe"), "Australia/Lord_Howe").time).toBe("02:30");
  });

  it("rejects bad input", () => {
    expect(() => toInstant("2026-02-30", "09:00", "UTC")).toThrow(RangeError);
    expect(() => toInstant("2026-02-01", "24:00", "UTC")).toThrow(RangeError);
  });
});

describe("todayIn", () => {
  it("is the local date, not the UTC date", () => {
    const now = Date.parse("2026-10-29T15:00:00Z");
    expect(todayIn("Australia/Brisbane", now)).toBe("2026-10-30");
    expect(todayIn("America/Los_Angeles", now)).toBe("2026-10-29");
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});
