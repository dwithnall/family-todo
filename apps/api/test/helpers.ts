import { env } from "cloudflare:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { createApp } from "../src/app.js";

export const ISSUER = "https://test-team.cloudflareaccess.com";
export const AUDIENCE = "test-audience";

async function makeKey(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };
  return { privateKey, jwk };
}

export const trusted = await makeKey("trusted");
export const untrusted = await makeKey("untrusted");

export const app = createApp({ keys: () => createLocalJWKSet({ keys: [trusted.jwk] }) });

export interface TokenOptions {
  email?: string | null;
  issuer?: string;
  audience?: string;
  expiresIn?: number; // seconds from now, may be negative
  key?: typeof trusted;
}

export async function token(opts: TokenOptions = {}): Promise<string> {
  const key = opts.key ?? trusted;
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { type: "app" };
  if (opts.email !== null) claims.email = opts.email ?? "alex@example.com";
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: key.jwk.kid! })
    .setSubject("sub-123")
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + (opts.expiresIn ?? 3600))
    .sign(key.privateKey);
}

export async function call(path: string, init: RequestInit & { jwt?: string | null } = {}) {
  const headers = new Headers(init.headers);
  const jwt = init.jwt === undefined ? await token() : init.jwt;
  if (jwt !== null) headers.set("Cf-Access-Jwt-Assertion", jwt);
  return app.request(path, { ...init, headers }, env);
}
