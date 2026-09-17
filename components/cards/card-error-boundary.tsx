"use client";

import { useTranslations } from "next-intl";
import { Component, type ReactNode } from "react";

import { ReceiptCard } from "./receipt-card";

/*
 * v1 components/cards/CardErrorBoundary.tsx and DegradedStub.tsx: one card's
 * render fault degrades to a stub with the raw payload behind a disclosure, and
 * never takes the conversation down. The stub is drawn in the receipt frame.
 */

type Props = { opName?: string; payload: unknown; children: ReactNode };
type State = { failed: boolean; lastPayload: unknown };

export class CardErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, lastPayload: this.props.payload };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // New settled data after a transient streaming fault gets another render attempt.
    if (props.payload !== state.lastPayload) {
      return { failed: false, lastPayload: props.payload };
    }
    return null;
  }

  componentDidCatch(error: unknown) {
    console.error(
      JSON.stringify({
        event: "card_render_fault",
        opName: this.props.opName,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  render() {
    if (this.state.failed) {
      return <DegradedStub opName={this.props.opName} payload={this.props.payload} />;
    }
    return this.props.children;
  }
}

export function DegradedStub({ opName, payload }: { opName?: string; payload: unknown }) {
  const t = useTranslations("cards");
  return (
    <ReceiptCard toolName={opName ?? t("stub.unrenderable")} metaRight={t("stub.meta")} noEntrance>
      <p role="status" className="text-sm text-fg-secondary">
        {t("stub.couldNotDraw")}
      </p>
      <details className="mt-2">
        <summary className="inline-flex cursor-pointer items-center font-mono text-[11px] tracking-[0.18em] text-fg-muted uppercase hover:text-foreground">
          {t("stub.rawDetails")}
        </summary>
        <pre className="mt-2 max-w-full overflow-x-auto rounded-lg border border-border bg-surface-2/40 p-3 font-mono text-[12px] text-fg-secondary">
          {safeStringify(payload)}
        </pre>
      </details>
    </ReceiptCard>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
