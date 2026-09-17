"use client"

import { cn } from "@/lib/utils"
import React, { useEffect, useState } from "react"
import { codeToHtml } from "shiki"

/*
 * Portaldot components/ui/code-block.tsx. One lint adapter: an empty block is
 * rendered directly instead of being set as state inside the effect
 * (react-hooks/set-state-in-effect); same output.
 */

export type CodeBlockProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose flex w-full flex-col overflow-clip border",
        "border-border bg-card text-card-foreground rounded-xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type CodeBlockCodeProps = {
  code: string
  language?: string
  theme?: string
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlockCode({
  code,
  language = "tsx",
  theme = "github-light",
  className,
  ...props
}: CodeBlockCodeProps) {
  const [highlighted, setHighlighted] = useState<{ key: string; html: string } | null>(null)
  const key = `${theme}:${language}:${code}`

  useEffect(() => {
    if (!code) return
    let live = true
    void codeToHtml(code, { lang: language, theme }).then((html) => {
      if (live) setHighlighted({ key: `${theme}:${language}:${code}`, html })
    })
    return () => {
      live = false
    }
  }, [code, language, theme])

  const classNames = cn(
    "w-full overflow-x-auto text-[13px] [&>pre]:px-4 [&>pre]:py-4",
    className
  )

  const highlightedHtml = !code ? "<pre><code></code></pre>" : highlighted?.key === key ? highlighted.html : null

  // SSR fallback: render plain code if not hydrated yet
  return highlightedHtml ? (
    <div
      className={classNames}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      {...props}
    />
  ) : (
    <div className={classNames} {...props}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock }
