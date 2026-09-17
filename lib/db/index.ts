import "server-only";

import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import { getConfig } from "../config.ts";
import * as schema from "./schema.ts";

/*
 * ONE singleton Drizzle client over the Neon serverless driver, connected
 * through the pooled string. globalThis-cached so dev hot-reload never stacks
 * clients — serverless connection exhaustion is the failure this forbids.
 * Relative .ts imports keep this chain runnable under plain Node
 * (scripts/verify-db.ts) alongside the Next bundler.
 */
function createDb() {
  return drizzle({ client: neon(getConfig().DATABASE_URL), schema });
}

type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { keeperhubDb?: Db };

export function getDb(): Db {
  globalForDb.keeperhubDb ??= createDb();
  return globalForDb.keeperhubDb;
}

/*
 * Runtime connectivity proof through the singleton, invoked only by
 * scripts/verify-db.ts (allowlisted in the dependency-cruiser rules).
 */
export async function healthCheck(): Promise<void> {
  await getDb().execute(sql`select 1`);
}
