/*
 * vendored configFields -> operation registry (Story 1.3, spine AD-3).
 *
 * Reads ONLY the committed snapshot (lib/registry/vendor/) - no references/,
 * no network, no env - and emits the generated modules into
 * lib/registry/generated/. Output is byte-stable so the CI regen-diff
 * (pnpm registry:check) rejects hand-edits and mapper/artifact drift alike.
 *
 * Run: pnpm registry:generate
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { emitRegistryFiles } from "./registry-emitter.ts";
import type { Snapshot } from "./registry-emitter.ts";

const snapshotUrl = new URL(
  "../lib/registry/vendor/configfields.snapshot.json",
  import.meta.url,
);
const outputDir = fileURLToPath(new URL("../lib/registry/generated/", import.meta.url));

try {
  const snapshot = JSON.parse(readFileSync(snapshotUrl, "utf8")) as Snapshot;
  const files = emitRegistryFiles(snapshot);

  mkdirSync(outputDir, { recursive: true });
  for (const existing of readdirSync(outputDir)) {
    if (existing.endsWith(".ts") && !files.has(existing)) {
      rmSync(join(outputDir, existing));
    }
  }
  for (const [name, contents] of files) {
    writeFileSync(join(outputDir, name), contents);
  }

  console.log(
    `Generated ${files.size} registry modules (${snapshot.actions.length} ops, ` +
      `snapshot ${snapshot.snapshot_id.slice(0, 19)}..., source ${snapshot.source_commit}).`,
  );
} catch (error) {
  console.error("Registry generation failed.");
  console.error(
    error instanceof Error ? `${error.name}: ${error.message}` : error,
  );
  process.exitCode = 1;
}
