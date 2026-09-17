"use client";

import { useTranslations } from "next-intl";

import { CopyChip } from "@/components/data/copy-chip";
import { Identicon } from "@/components/data/identicon";
import { useVoiceFormId } from "@/components/voice/voice-form-context";
import { readInputAnswer, readInputRequest, type InputField } from "@/lib/chat/input-request";

import { InputRequestForm } from "./input-request-form";
import { EmptyLine, Mono, Row } from "./parts";
import { ReceiptCard, type ReceiptTone } from "./receipt-card";
import type { WriteCeremony } from "./write-card.ts";
import { GHOST_BUTTON, NetworkName } from "./write-card-parts";

/*
 * A form card (decision 32): the assistant asked for details it didn't have.
 * Portaldot's receipt frame with DeepBookie SignReceipt's kicker and status line
 * (as the write card), the form while it waits, then the record of the answer in
 * the write card's instruction rows. While voice holds the form above its bar
 * (decision 33) the card says so instead of offering a second copy. A read-only
 * chat shows a form nobody answered as never answered.
 */

export function InputRequestCard({
  toolCallId,
  input,
  output,
  ceremony,
  live,
  resumeErrored,
}: {
  toolCallId?: string;
  input: unknown;
  output?: unknown;
  ceremony?: WriteCeremony;
  live: boolean;
  resumeErrored: boolean;
}) {
  const voiceFormId = useVoiceFormId();
  const t = useTranslations("cards");
  const tc = useTranslations("common");
  const request = readInputRequest(input);
  const answer = output === undefined ? null : readInputAnswer(output);

  if (request === null) {
    return (
      <ReceiptCard toolName="request_input" metaRight={t("form.unreadableMeta")}>
        <EmptyLine>{t("form.unreadable")}</EmptyLine>
      </ReceiptCard>
    );
  }

  const answerFn = live && toolCallId !== undefined ? ceremony?.answer : undefined;
  const inVoice = answer === null && toolCallId !== undefined && voiceFormId === toolCallId;
  const unsent = answer !== null && resumeErrored && answerFn !== undefined;

  const view: { meta: string; status: string; tone: ReceiptTone } = unsent
    ? { meta: t("form.meta.notSent"), status: t("form.status.notSent"), tone: "pending" }
    : answer !== null
      ? "cancelled" in answer
        ? { meta: t("form.meta.closed"), status: t("form.status.closed"), tone: "default" }
        : { meta: t("form.meta.answered"), status: t("form.status.answered"), tone: "default" }
      : inVoice
        ? { meta: t("form.meta.fillingAbove"), status: t("form.status.fillingAbove"), tone: "pending" }
        : answerFn !== undefined
          ? { meta: t("form.meta.detailsNeeded"), status: t("form.status.waiting"), tone: "pending" }
          : { meta: t("form.meta.neverAnswered"), status: t("form.status.neverAnswered"), tone: "default" };

  return (
    <ReceiptCard toolName="request_input" metaRight={view.meta} tone={view.tone}>
      <div className="min-w-0">
        <div className="font-mono text-[10px] tracking-[0.18em] text-foreground uppercase">{request.title ?? t("form.title")}</div>
        <div className="mt-0.5 text-[11.5px] text-fg-muted">{view.status}</div>
      </div>
      {request.reason !== undefined && <p className="mt-2 text-[13px] text-fg-secondary">{request.reason}</p>}

      {answer === null && !inVoice && answerFn !== undefined && toolCallId !== undefined ? (
        <InputRequestForm request={request} onAnswer={(value) => answerFn(toolCallId, value)} />
      ) : answer !== null && "values" in answer ? (
        <div className="mt-3 divide-y divide-border/60">
          {request.fields
            .filter((field) => answer.values[field.key] !== undefined)
            .map((field) => (
              <Row key={field.key} k={field.label} v={<AnswerValue field={field} value={answer.values[field.key]} />} />
            ))}
        </div>
      ) : answer === null ? (
        <ul className="mt-3 space-y-1 text-[12.5px] text-fg-muted">
          {request.fields.map((field) => (
            <li key={field.key}>{field.label}</li>
          ))}
        </ul>
      ) : null}

      {unsent && toolCallId !== undefined && (
        <div className="mt-3 flex">
          <button type="button" onClick={() => answerFn(toolCallId, answer)} className={GHOST_BUTTON}>
            {tc("tryAgain")}
          </button>
        </div>
      )}
    </ReceiptCard>
  );
}

function AnswerValue({ field, value }: { field: InputField; value: string }) {
  if (field.kind === "network") return <NetworkName chainId={value} />;
  if (field.kind === "address") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Identicon address={value} size={14} />
        <CopyChip value={value} />
      </span>
    );
  }
  if (field.kind === "amount") {
    return (
      <span>
        <Mono>{value}</Mono>
        {field.unit !== undefined && <span className="ml-1 font-mono text-xs text-fg-muted">{field.unit}</span>}
      </span>
    );
  }
  const option = field.options?.find((candidate) => candidate.value === value);
  return <span className="[overflow-wrap:anywhere]">{option?.label ?? value}</span>;
}
