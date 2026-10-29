import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

/** The header Cloudflare Access adds to every request it lets through. */
export const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

export interface AccessConfig {
  /** For example "https://yourteam.cloudflareaccess.com". */
  teamDomain: string;
  /** The Application Audience (AUD) tag of the Access application. */
  audience: string;
}

export interface Identity {
  email: string;
  subject: string;
}

export class AccessError extends Error {
  override name = "AccessError";
}

export function normalizeTeamDomain(teamDomain: string): string {
  const trimmed = teamDomain.trim().replace(/\/+$/, "");
  return /^https:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// One key set per isolate per team, so the certs are fetched once and cached by jose.
const remoteKeySets = new Map<string, JWTVerifyGetKey>();

export function remoteKeys(teamDomain: string): JWTVerifyGetKey {
  const domain = normalizeTeamDomain(teamDomain);
  let keys = remoteKeySets.get(domain);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${domain}/cdn-cgi/access/certs`));
    remoteKeySets.set(domain, keys);
  }
  return keys;
}

/**
 * Verifies an Access identity token: signature against the team's keys, expiry,
 * issuer and audience. Never trust an email header on its own (spec NFR design).
 */
export async function verifyAccessToken(
  token: string | null | undefined,
  config: AccessConfig,
  keys: JWTVerifyGetKey,
  now?: Date,
): Promise<Identity> {
  if (!token) throw new AccessError("missing token");
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: normalizeTeamDomain(config.teamDomain),
      audience: config.audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email"],
      ...(now ? { currentDate: now } : {}),
    });
    const email = payload.email;
    if (typeof email !== "string" || !email.includes("@")) throw new AccessError("token has no email");
    return { email: email.trim().toLowerCase(), subject: String(payload.sub) };
  } catch (err) {
    if (err instanceof AccessError) throw err;
    if (err instanceof errors.JOSEError) throw new AccessError(err.code);
    throw new AccessError("invalid token");
  }
}
