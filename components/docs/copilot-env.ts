/*
 * The settings the copilot reads (lib/config.ts), kept in one place for the
 * landing's install box and the docs' Getting started (decision 22): the
 * Copilot tab and the docs show them as .env.local, the Vercel tab as one
 * `vercel env add` per variable. Settings with defaults (OPENAI_CHAT_MODEL,
 * KEEPERHUB_MCP_URL, KEEPERHUB_URL) are left out.
 */

export type CopilotEnvGroup = { comment: string; vars: ReadonlyArray<{ name: string; example: string }> };

export const COPILOT_ENV: readonly CopilotEnvGroup[] = [
  {
    comment: "Sign-in: an OAuth client registered with KeeperHub for this app's address",
    vars: [
      { name: "KEEPERHUB_OAUTH_ISSUER", example: "https://app.keeperhub.com" },
      { name: "KEEPERHUB_OAUTH_CLIENT_ID", example: "" },
      { name: "KEEPERHUB_OAUTH_CLIENT_SECRET", example: "" },
      { name: "APP_BASE_URL", example: "http://localhost:3001" },
    ],
  },
  {
    comment: "Conversations and the activity record (Postgres)",
    vars: [{ name: "DATABASE_URL", example: "" }],
  },
  {
    comment: "The assistant, and the secrets that seal sessions and approvals",
    vars: [
      { name: "OPENAI_API_KEY", example: "" },
      { name: "SESSION_SECRET", example: "" },
      { name: "TOOL_APPROVAL_SECRET", example: "" },
    ],
  },
];

/** The settings as a .env.local file, with each group's comment or without. */
export function copilotEnvFile({ comments }: { comments: boolean }): string {
  return COPILOT_ENV.map((group) =>
    [...(comments ? [`# ${group.comment}`] : []), ...group.vars.map((variable) => `${variable.name}=${variable.example}`)].join("\n"),
  ).join(comments ? "\n\n" : "\n");
}

/** The same settings added to a Vercel project's production environment, one command each (Vercel asks for each value). */
export function vercelEnvCommands(): string {
  return COPILOT_ENV.flatMap((group) => group.vars)
    .map((variable) => `vercel env add ${variable.name} production`)
    .join("\n");
}
