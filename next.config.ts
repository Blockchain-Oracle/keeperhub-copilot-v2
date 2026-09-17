import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Next 16's `next dev`/`next build` auto-appends a "nextjs-agent-rules" block
  // to AGENTS.md. AGENTS.md is this repo's curated governance source (see
  // CLAUDE.md), not a place for framework-injected boilerplate — so the
  // auto-injection is disabled to keep it pristine.
  agentRules: false,
};

// The screens' languages (decision 41): next-intl reads i18n/request.ts.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
