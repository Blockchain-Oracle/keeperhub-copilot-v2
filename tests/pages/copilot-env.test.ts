import { describe, expect, it } from "vitest";

import { COPILOT_ENV, copilotEnvFile, vercelEnvCommands } from "@/components/docs/copilot-env";

const NAMES = COPILOT_ENV.flatMap((group) => group.vars.map((variable) => variable.name));

describe("the copilot's settings on the landing and in the docs (decision 22)", () => {
  it("lists the same variables for .env.local and for Vercel", () => {
    expect(copilotEnvFile({ comments: false }).split("\n").map((line) => line.split("=")[0])).toEqual(NAMES);
    expect(vercelEnvCommands().split("\n")).toEqual(NAMES.map((name) => `vercel env add ${name} production`));
    expect(copilotEnvFile({ comments: true })).toContain("# Conversations and the activity record (Postgres)\nDATABASE_URL=");
  });

  it("names every setting lib/config.ts requires", () => {
    expect(NAMES).toEqual(
      expect.arrayContaining([
        "DATABASE_URL",
        "KEEPERHUB_OAUTH_ISSUER",
        "KEEPERHUB_OAUTH_CLIENT_ID",
        "KEEPERHUB_OAUTH_CLIENT_SECRET",
        "SESSION_SECRET",
        "OPENAI_API_KEY",
        "TOOL_APPROVAL_SECRET",
      ]),
    );
  });
});
