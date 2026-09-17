import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

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
      <span className="font-mono text-xs tracking-widest text-primary uppercase">Builders</span>
      <h1
        className="mt-3 text-[34px] leading-tight tracking-[-0.02em] text-foreground"
        style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
      >
        Use KeeperHub from your own MCP client
      </h1>
      <p className="mt-3 text-base leading-relaxed text-fg-secondary">
        This page is for connecting your own tools. You do not need any of it to use the copilot —
        that only needs you to sign in.
      </p>
      <p className="mt-3 text-base leading-relaxed text-fg-secondary">
        KeeperHub runs its own MCP server carrying the same {registryMeta.actionCount} actions, so
        Claude Code, Cursor or any MCP client can reach them with a KeeperHub API key.
      </p>
      <div className="mt-5 flex gap-3 rounded-xl border border-pending/30 bg-pending/8 px-4 py-3 text-[14px] leading-relaxed text-fg-secondary">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-pending" />
        <p>
          The cards in this app are this app&apos;s. In another client there are none: whatever you
          connect decides for itself what it asks you before it runs something. A key with{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[13px] text-foreground">mcp:read</code>{" "}
          can only read.
        </p>
      </div>

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
