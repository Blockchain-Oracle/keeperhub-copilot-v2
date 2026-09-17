"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/* Portaldot components/app/markdown.tsx, unchanged: the assistant speaks without a bubble. */

const components: Components = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-2 transition-opacity hover:opacity-80"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 marker:text-fg-muted">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 marker:text-fg-muted">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h1 className="text-base font-semibold tracking-tight text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-semibold tracking-tight text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold tracking-tight text-foreground">{children}</h3>,
  hr: () => <hr className="border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.85em] text-foreground [pre_&]:bg-transparent [pre_&]:p-0">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-xl border border-border bg-card p-3 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border px-2 py-1.5 text-left font-medium text-muted-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-border/60 px-2 py-1.5 align-top">{children}</td>,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
