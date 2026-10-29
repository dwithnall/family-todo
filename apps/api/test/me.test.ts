import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { call, token } from "./helpers.js";

const write = { "Content-Type": "application/json", "X-Family-Todo": "1" };

describe("GET /api/me (US-11)", () => {
  it("creates the account on first sign-in, once", async () => {
    const jwt = await token({ email: "New.Person@Example.com" });
    const [a, b] = await Promise.all([call("/api/me", { jwt }), call("/api/me", { jwt })]);
    const me = await a.json<Record<string, string>>();
    expect(await b.json()).toEqual(me);
    expect(me).toMatchObject({
      email: "new.person@example.com",
      displayName: "new.person",
      timeZone: "Australia/Brisbane",
      defaultReminderTime: "09:00",
    });
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM user WHERE email = ?").bind("new.person@example.com").first("n");
    expect(count).toBe(1);
  });

  it("returns the same account on later sign-ins", async () => {
    const first = await (await call("/api/me")).json<{ id: string }>();
    const second = await (await call("/api/me")).json<{ id: string }>();
    expect(second.id).toBe(first.id);
  });

  it("sets API safety headers", async () => {
    const res = await call("/api/me");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("PATCH /api/me (FR-17)", () => {
  it("updates time zone, reminder time and name", async () => {
    const res = await call("/api/me", {
      method: "PATCH",
      headers: write,
      body: JSON.stringify({ timeZone: "Europe/London", defaultReminderTime: "07:30", displayName: "Alex" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ timeZone: "Europe/London", defaultReminderTime: "07:30", displayName: "Alex" });
    expect(await (await call("/api/me")).json()).toMatchObject({ timeZone: "Europe/London" });
  });

  it.each([
    [{ timeZone: "Nowhere/Land" }],
    [{ defaultReminderTime: "25:00" }],
    [{ email: "other@example.com" }],
    [{}],
  ])("rejects %j", async (body) => {
    const res = await call("/api/me", { method: "PATCH", headers: write, body: JSON.stringify(body) });
    expect(res.status).toBe(400);
  });

  it("rejects a body that is not JSON", async () => {
    const res = await call("/api/me", { method: "PATCH", headers: write, body: "{" });
    expect(res.status).toBe(400);
  });

  it("refuses a write without the custom header", async () => {
    const res = await call("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Mallory" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("unknown routes", () => {
  it("return JSON 404 after sign-in", async () => {
    const res = await call("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("still require a token", async () => {
    expect((await call("/api/nope", { jwt: null })).status).toBe(401);
  });
});
