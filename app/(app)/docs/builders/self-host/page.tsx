import type { Metadata } from "next";

import { copilotEnvFile } from "@/components/docs/copilot-env";
import { DocPage, H2, Item, List, Next, Note, P, UI } from "@/components/docs/prose";
import { CodeBlock, CodeBlockCode } from "@/components/ui/code-block";

export const metadata: Metadata = { title: "Run it yourself" };

// The same settings the landing's Copilot and Vercel tabs show (decision 22).
const envCode = copilotEnvFile({ comments: true });

export default function SelfHostPage() {
  return (
    <DocPage
      eyebrow="Builders"
      title="Run it yourself"
      lede="Everything here is for running your own copy. If you are using the hosted app, you never need any of it."
    >
      <H2>What it needs</H2>
      <P>
        The copilot signs in with KeeperHub, so it needs its own settings and nothing of yours. Put
        these in <UI>.env.local</UI>. The two secrets need at least 32 characters each.
      </P>

      <CodeBlock>
        <div className="border-border border-b px-4 py-2 font-mono text-xs text-fg-muted">
          .env.local
        </div>
        <CodeBlockCode code={envCode} language="bash" theme="github-dark" />
      </CodeBlock>

      <Note tone="warn">
        <p>
          The sign-in client is registered against one exact callback address. A copy running
          somewhere else needs its own client registered for its own address — the hosted one will
          refuse a callback it does not recognise, which is the point of it.
        </p>
      </Note>

      <H2>Its own database</H2>
      <P>
        The copilot keeps conversations and the ledger in its own Postgres. That is separate from
        KeeperHub&apos;s: nothing here writes to the platform&apos;s data, and dropping this database
        loses your chat history and this app&apos;s record — not your automations, your wallet or
        anything that happened on the chain.
      </P>

      <H2>Running it</H2>
      <List>
        <Item>
          <UI>pnpm dev</UI> — the development server.
        </Item>
        <Item>
          <UI>pnpm typecheck</UI>, <UI>pnpm lint</UI>, <UI>pnpm test</UI> — the checks. All three
          should be clean before a deploy.
        </Item>
        <Item>
          <UI>pnpm build</UI> — the production build.
        </Item>
      </List>

      <Next
        links={[
          {
            href: "/docs/builders/mcp",
            title: "MCP setup",
            body: "Reaching the same actions from your own client.",
          },
          {
            href: "/docs/how/architecture",
            title: "How it connects",
            body: "What each piece is responsible for.",
          },
        ]}
      />
    </DocPage>
  );
}
