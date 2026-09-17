"use client";

import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";

import { useAccount } from "@/components/shell/account-context";
import { useSelectedNetwork } from "@/components/shell/header/network-pill";
import {
  checkInputAnswer,
  fieldSpecFor,
  networkFor,
  type InputAnswer,
  type InputIssue,
  type InputRequest,
} from "@/lib/chat/input-request";
import { useTranslate } from "@/lib/i18n/use-translate";
import { isSolanaChainId } from "@/lib/registry/simulatability";

import { mapIssuesToFieldErrors, type FieldError } from "./editable.ts";
import { FieldEditor } from "./fields/field-editor";
import { NetworkField } from "./fields/network-field";
import { GHOST_BUTTON, PRIMARY_BUTTON } from "./write-card-parts";

/*
 * The form inside a form card and the voice sheet (decisions 32–33). The write
 * card's edit panel grammar (components/cards/write-card-parts.tsx EditPanel):
 * FieldEditor and NetworkField rows on the inset, the error beside its field,
 * the primary and ghost buttons below. The same check the server runs
 * (checkInputAnswer) runs first, so a bad value stays in the form with its reason.
 *
 * Ours: an address field offers "Use my org wallet"; a network field starts on
 * the network in the app header; Continue and Close are guarded against a double
 * click in the same tick.
 */

export type AnswerProblem = { message: string; issues?: InputIssue[] };

export function InputRequestForm({
  request,
  onAnswer,
}: {
  request: InputRequest;
  /** Hands the answer on. Resolves with a problem when it was not taken. */
  onAnswer: (answer: InputAnswer) => void | AnswerProblem | Promise<void | AnswerProblem>;
}) {
  const { identity } = useAccount();
  const network = useSelectedNetwork();
  const t = useTranslations("cards");
  const tc = useTranslations("common");
  const translate = useTranslate();
  const wallet = identity.status === "signed-in" ? identity.walletAddress : null;
  const specs = useMemo(() => request.fields.map((field) => fieldSpecFor(field, translate)), [request, translate]);
  const specsByKey = useMemo(() => Object.fromEntries(specs.map((spec) => [spec.key, spec])), [specs]);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      request.fields.map((field) => [field.key, field.prefill ?? (field.kind === "network" ? network.chainId : "")]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, FieldError>>({});
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);

  function change(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: typeof value === "string" ? value : "" }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function send(answer: InputAnswer) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setNote("");
    try {
      const problem = await onAnswer(answer);
      if (problem) {
        setNote(problem.message);
        if (problem.issues !== undefined) setErrors(mapIssuesToFieldErrors(problem.issues, specsByKey, translate));
      }
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  function submit() {
    const checked = checkInputAnswer(request, { values }, translate);
    if (!checked.ok) {
      setErrors(mapIssuesToFieldErrors(checked.issues, specsByKey, translate));
      setNote(t("form.checkHighlighted"));
      return;
    }
    void send(checked.answer);
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-2/40 px-3">
      <div className="divide-y divide-border/60">
        {request.fields.map((field, index) => {
          const spec = specs[index];
          if (field.kind === "network") {
            return (
              <NetworkField
                key={field.key}
                spec={spec}
                value={values[field.key]}
                onChange={(value) => change(field.key, value)}
                error={errors[field.key]}
                disabled={sending}
              />
            );
          }
          const fieldNetwork = networkFor(field, request, values);
          const offerWallet =
            field.kind === "address" && wallet !== null && !isSolanaChainId(fieldNetwork) && values[field.key] !== wallet;
          return (
            <div key={field.key}>
              <FieldEditor
                spec={spec}
                value={values[field.key]}
                onChange={(value) => change(field.key, value)}
                error={errors[field.key]}
                disabled={sending}
              />
              {offerWallet && (
                <button
                  type="button"
                  onClick={() => change(field.key, wallet)}
                  disabled={sending}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] text-fg-secondary transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
                >
                  <Wallet aria-hidden className="size-3.5" />
                  {t("form.useOrgWallet")}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {note !== "" && (
        <p role="status" className="pb-1 text-[12px] font-medium text-destructive">
          {note}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border/60 py-2.5">
        <button type="button" onClick={submit} disabled={sending} className={PRIMARY_BUTTON}>
          {sending ? t("form.sending") : tc("continue")}
        </button>
        <button type="button" onClick={() => void send({ cancelled: true })} disabled={sending} className={GHOST_BUTTON}>
          {tc("close")}
        </button>
      </div>
    </div>
  );
}
