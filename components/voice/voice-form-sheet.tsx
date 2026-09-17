"use client";

import { useTranslations } from "next-intl";

import { InputRequestForm, type AnswerProblem } from "@/components/cards/input-request-form";
import type { InputAnswer, InputRequest } from "@/lib/chat/input-request";

/*
 * The form voice asked for, rising out of the voice bar (decision 33): nobody
 * reads an address aloud, so it is typed or pasted here while the mic waits.
 * The composer's glass and the voice bar's pending glow around the form card's
 * form. Its chat card says it is being filled in above, and becomes the record
 * once this is answered.
 */
export function VoiceFormSheet({
  request,
  onAnswer,
}: {
  request: InputRequest;
  onAnswer: (answer: InputAnswer) => Promise<void | AnswerProblem>;
}) {
  const t = useTranslations("voice.formSheet");
  return (
    <section
      aria-label={request.title ?? t("detailsNeeded")}
      className="voice-form-sheet mb-2 max-h-[min(55dvh,34rem)] overflow-y-auto overscroll-contain rounded-3xl bg-card/90 px-4 pt-3.5 pb-1 backdrop-blur-xl"
    >
      <p className="font-mono text-[10px] tracking-[0.18em] text-pending uppercase">{t("detailsNeeded")}</p>
      <p className="mt-0.5 text-[15px] font-semibold text-foreground">{request.title ?? t("fallbackTitle")}</p>
      {request.reason !== undefined && <p className="mt-1 text-[13px] text-fg-secondary">{request.reason}</p>}
      <InputRequestForm request={request} onAnswer={onAnswer} />
    </section>
  );
}
