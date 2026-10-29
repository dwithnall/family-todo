import { isValidTimeZone } from "@family-todo/recurrence";
import { updateMeSchema, WRITE_HEADER, type ApiError, type Me } from "@family-todo/shared";
import { Hono, type Context } from "hono";
import type { JWTVerifyGetKey } from "jose";
import { ACCESS_JWT_HEADER, AccessError, remoteKeys, verifyAccessToken, type Identity } from "./access.js";
import { getOrCreateUser, updateUser } from "./users.js";

export interface Env {
  DB: D1Database;
  /** For example "https://yourteam.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN: string;
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD: string;
  /** Time zone given to a new account until the person changes it. */
  DEFAULT_TIME_ZONE?: string;
}

export interface AppVariables {
  identity: Identity;
  me: Me;
}

export type AppEnv = { Bindings: Env; Variables: AppVariables };

export interface AppOptions {
  /** Where to get the Access signing keys. Tests pass local keys. */
  keys?: (env: Env) => JWTVerifyGetKey;
}

export function apiError(c: Context, status: 400 | 401 | 403 | 404 | 500, code: string, message: string) {
  return c.json<ApiError>({ error: { code, message } }, status);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createApp(options: AppOptions = {}) {
  const getKeys = options.keys ?? ((env: Env) => remoteKeys(env.ACCESS_TEAM_DOMAIN));
  const app = new Hono<AppEnv>();

  app.use("/api/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
  });

  // Identity: every API call carries a verified Access token, or it stops here.
  app.use("/api/*", async (c, next) => {
    const { ACCESS_TEAM_DOMAIN, ACCESS_AUD } = c.env;
    if (!ACCESS_TEAM_DOMAIN || !ACCESS_AUD) {
      return apiError(c, 500, "not_configured", "Access is not configured for this Worker");
    }
    try {
      const identity = await verifyAccessToken(
        c.req.header(ACCESS_JWT_HEADER),
        { teamDomain: ACCESS_TEAM_DOMAIN, audience: ACCESS_AUD },
        getKeys(c.env),
      );
      c.set("identity", identity);
    } catch (err) {
      if (err instanceof AccessError) return apiError(c, 401, "unauthenticated", "Sign in again");
      throw err;
    }
    await next();
  });

  // Browser safety: a cross-site form or image cannot add a custom header.
  app.use("/api/*", async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method) && c.req.header(WRITE_HEADER) !== "1") {
      return apiError(c, 403, "missing_header", `Write requests need the ${WRITE_HEADER} header`);
    }
    await next();
  });

  // The account, created on first sign-in.
  app.use("/api/*", async (c, next) => {
    const tz = c.env.DEFAULT_TIME_ZONE;
    const me = await getOrCreateUser(c.env.DB, c.get("identity").email, {
      timeZone: tz && isValidTimeZone(tz) ? tz : "UTC",
    });
    c.set("me", me);
    await next();
  });

  app.get("/api/me", (c) => c.json(c.get("me")));

  app.patch("/api/me", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = updateMeSchema.safeParse(body);
    if (!parsed.success) return apiError(c, 400, "invalid_body", parsed.error.issues[0]?.message ?? "Invalid body");
    return c.json(await updateUser(c.env.DB, c.get("me").id, parsed.data));
  });

  app.notFound((c) => apiError(c, 404, "not_found", "Not found"));

  app.onError((err, c) => {
    console.error(err);
    return apiError(c, 500, "internal", "Something went wrong");
  });

  return app;
}
