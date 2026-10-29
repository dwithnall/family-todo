import type { D1Migration } from "cloudflare:test";
import type { Env as AppEnv } from "../src/app.js";

declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
