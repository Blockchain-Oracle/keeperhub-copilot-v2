import { readFileSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

/*
 * drizzle-kit does not load env files. This dependency-free loader picks up
 * .env.local for local runs; CI and Vercel provide DATABASE_URL directly.
 * This file and lib/config.ts are the only sanctioned process.env readers.
 * Handled line shapes: CRLF endings, indentation, an `export ` prefix,
 * single- or double-quoted values, and inline ` # comments` on unquoted
 * values (dotenv semantics).
 */
function loadEnvLocal(): void {
  let content: string;
  try {
    content = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const match = rawLine
      .trim()
      .match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    let value = match[2].trim();
    const quote = value.charAt(0);
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trimEnd();
    }
    process.env[match[1]] = value;
  }
}

loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Provide it in .env.local or the environment before running drizzle-kit.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dbCredentials: { url },
});
