import { describe, expect, it } from "vitest";

import { parseInsufficientScope } from "@/lib/session/insufficient-scope";

// The platform's verbatim shape (references/keeperhub lib/mcp/tools.ts:30-57):
// a SUCCESSFUL JSON-RPC response with isError:true whose content[0].text is
// JSON carrying error === "insufficient_scope".
const platformResult = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        error: "insufficient_scope",
        message:
          "This tool requires the `mcp:write` OAuth scope. The current token only has `mcp:read`.",
        required_scope: "mcp:write",
        granted_scope: "mcp:read",
        tool: "execute_transfer",
        upgrade_url:
          "/settings/mcp/reauthorize?required=mcp%3Awrite&granted=mcp%3Aread",
        hint: "Reauthorize the MCP integration and request `mcp:write` on the consent screen.",
      }),
    },
  ],
  isError: true,
};

describe("parseInsufficientScope", () => {
  it("extracts the upgrade fields from the platform's exact shape", () => {
    const parsed = parseInsufficientScope(platformResult);
    expect(parsed).not.toBeNull();
    expect(parsed?.requiredScope).toBe("mcp:write");
    expect(parsed?.grantedScope).toBe("mcp:read");
    expect(parsed?.upgradeUrl).toBe(
      "/settings/mcp/reauthorize?required=mcp%3Awrite&granted=mcp%3Aread",
    );
    expect(parsed?.hint).toContain("Reauthorize");
  });

  it("returns null for a DIFFERENT isError result (isError alone is not sufficient)", () => {
    const other = {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "validation_failed", message: "bad" }),
        },
      ],
      isError: true,
    };
    expect(parseInsufficientScope(other)).toBeNull();
  });

  it("returns null for a successful result", () => {
    expect(
      parseInsufficientScope({
        content: [{ type: "text", text: "ok" }],
        isError: false,
      }),
    ).toBeNull();
  });

  it("returns null when the error text is not JSON", () => {
    expect(
      parseInsufficientScope({
        content: [{ type: "text", text: "Forbidden" }],
        isError: true,
      }),
    ).toBeNull();
  });

  it("returns null for structurally malformed results", () => {
    expect(parseInsufficientScope(null)).toBeNull();
    expect(parseInsufficientScope({})).toBeNull();
    expect(parseInsufficientScope({ isError: true, content: [] })).toBeNull();
  });
});
