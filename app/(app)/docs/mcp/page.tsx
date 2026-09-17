import type { Metadata } from "next";

import { CopyRow } from "@/components/docs/copy-row";
import { InstallCommand, type InstallClient } from "@/components/docs/install-command";
import { getPlatformConfig } from "@/lib/config";
import { registryMeta } from "@/lib/registry";

export const metadata: Metadata = { title: "MCP setup" };

/*
 * Portaldot app/docs/skill/page.tsx and skill-content.tsx: eyebrow, title,
 * lede, then copy rows. Portaldot's install terminal (its Getting started
 * page) sits on top here, with the MCP client commands the landing's Install
 * section shows.
 *
 * Changes: the subject is KeeperHub's own MCP server rather than a skill, so
 * there is no collapsible skill file; the address comes from the platform
 * config. Copy is ours.
 */

export default function McpSetupPage() {
  const url = `${getPlatformConfig().keeperhubUrl}/mcp`;
  const clients: InstallClient[] = [
    {
      id: "claude-code",
      label: "Claude Code",
      lang: "bash",
      command: `claude mcp add --transport http keeperhub ${url} --header "Authorization: Bearer kh_YOUR_KEY"`,
      prompt: "$",
    },
    {
      id: "cursor",
      label: "Cursor",
      lang: "json",
      command: `{
  "mcpServers": {
    "keeperhub": {
      "url": "${url}",
      "headers": { "Authorization": "Bearer kh_YOUR_KEY" }
    }
  }
}`,
      prompt: "~/.cursor/mcp.json",
    },
  ];

  return (
    <div className="max-w-2xl">
      <span className="font-mono text-xs tracking-widest text-primary uppercase">MCP setup</span>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-foreground">Use KeeperHub from your MCP client</h1>
      <p className="mt-3 text-base text-muted-foreground">
        KeeperHub runs its own MCP server with the same {registryMeta.actionCount} actions. Connect Claude Code, Cursor or
        any MCP client with a KeeperHub API key. This app&apos;s cards only apply here: in another client, what needs
        approval is up to that client.
      </p>

      <div className="mt-8">
        <InstallCommand clients={clients} />
      </div>

      <div className="mt-8 space-y-3">
        <CopyRow label="Server address" value={url} note="KeeperHub's hosted MCP server, over HTTP." />
        <CopyRow
          label="Authorization header"
          value="Authorization: Bearer kh_YOUR_KEY"
          note="Create a kh_ API key in KeeperHub. Give it mcp:write to run writes, or mcp:read for reads only."
        />
        <CopyRow
          label="Or just tell your agent"
          value={`Connect to the KeeperHub MCP server at ${url} with my API key, then list the actions you can run.`}
          note="For agents that can add MCP servers themselves."
        />
      </div>
    </div>
  );
}
