import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AUDIENCE, call, token, untrusted } from "./helpers.js";

// Identity negative tests (spec test plan, U1).
describe("identity token check", () => {
  it("accepts a valid token", async () => {
    const res = await call("/api/me");
    expect(res.status).toBe(200);
  });

  it.each([
    ["missing token", async () => null],
    ["garbage token", async () => "not-a-jwt"],
    ["bad signature", () => token({ key: untrusted })],
    ["wrong audience", () => token({ audience: "someone-else" })],
    ["wrong issuer", () => token({ issuer: "https://evil.cloudflareaccess.com" })],
    ["expired token", () => token({ expiresIn: -120 })],
    ["no email claim", () => token({ email: null })],
  ])("rejects %s with 401", async (_name, make) => {
    const res = await call("/api/me", { jwt: await make() });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthenticated", message: "Sign in again" } });
  });

  it("rejects an unsigned token", async () => {
    const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const now = Math.floor(Date.now() / 1000);
    const jwt = `${enc({ alg: "none" })}.${enc({ email: "alex@example.com", aud: AUDIENCE, exp: now + 60, iat: now, sub: "x" })}.`;
    expect((await call("/api/me", { jwt })).status).toBe(401);
  });

  it("ignores an email header with no token", async () => {
    const res = await call("/api/me", { jwt: null, headers: { "Cf-Access-Authenticated-User-Email": "alex@example.com" } });
    expect(res.status).toBe(401);
  });

  it("fails closed when Access is not configured", async () => {
    const res = await createApp().request("/api/me", {}, { ...env, ACCESS_AUD: "" });
    expect(res.status).toBe(500);
  });
});
