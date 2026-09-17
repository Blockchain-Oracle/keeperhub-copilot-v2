/*
 * Proves runtime connectivity through the lib/db singleton without breaching
 * the AD-9 lint boundary (this script is explicitly allowlisted).
 *
 * Run: pnpm db:verify
 * (node --conditions react-server --env-file-if-exists=.env.local)
 */
import { healthCheck } from "../lib/db/index.ts";

try {
  await healthCheck();
  console.log("Database connectivity verified through the singleton client.");
} catch (error) {
  console.error("Database connectivity check failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
