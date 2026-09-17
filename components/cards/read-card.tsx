"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";

import { ExplorerLink } from "@/components/data/explorer-link";
import { useTranslate } from "@/lib/i18n/use-translate";
import { getInputSchema, getOperationEntry, type FieldSpec } from "@/lib/registry";
import { INPUT_SCHEMAS, type SurfaceToolName } from "@/lib/registry/surface-tools";
import { contractLink, readResult } from "@/lib/read-results";

import {
  buildParams,
  filterAlternatives,
  isDirty,
  isFieldVisible,
  mapIssuesToFieldErrors,
  seedFormState,
  type FieldError,
  type FormValues,
  type ProposalAlternative,
} from "./editable.ts";
import { FieldEditor } from "./fields/field-editor";
import { OptionSwitch } from "./fields/option-switch";
import { humanizeKey } from "./format.ts";
import { Label, ResultRows, ResultValue, Row } from "./parts";
import { ReceiptCard } from "./receipt-card";

/*
 * v1 components/cards/GenericReadCard.tsx in the receipt frame. Every
 * parameter seeds once per tool call into an editable row; "Run again" re-runs
 * the read with the edited values through the chat route, no model involved;
 * the model's declared alternatives switch the operation, which retires this
 * card for a fresh one.
 *
 * Changes: the result shows KeeperHub's named outputs rather than its
 * { success, result } wrapper, with the contract's explorer link; values follow
 * Portaldot GenericResultCard's rules; the edited state reads in the meta slot.
 */

export type RerunRequest = {
  tool: SurfaceToolName;
  args: Record<string, unknown>;
  /** Set only for an operation switch: retires this card. */
  supersedesToolCallId?: string;
  /** The card's persisted fingerprint on a same-operation re-run, so a drifted operation quarantines. */
  fingerprint?: string;
};

type CardsTranslator = ReturnType<typeof useTranslations<"cards">>;

// The schema-free read verbs' fields; a protocol action's come from its registry entry.
function contractCallFields(t: CardsTranslator): FieldSpec[] {
  return [
    { key: "chain_id", label: t("labels.chainId"), type: "text", required: true },
    { key: "contract_address", label: t("labels.contractAddress"), type: "protocol-address", required: true },
    { key: "function_name", label: t("labels.functionName"), type: "text", required: true },
    { key: "function_args", label: t("labels.functionArgs"), type: "json-editor", required: false },
    { key: "abi", label: t("labels.abi"), type: "json-editor", required: false },
  ];
}
function walletFields(t: CardsTranslator): FieldSpec[] {
  return [{ key: "integrationId", label: t("labels.integrationId"), type: "text", required: true }];
}

const GHOST_BUTTON =
  "rounded-full border border-border px-4 py-1.5 text-sm text-fg-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-40";

export function ReadCard({
  toolName,
  opId,
  toolCallId,
  fingerprint,
  input,
  data,
  retired = false,
  rerun,
}: {
  toolName: string;
  opId?: string;
  toolCallId?: string;
  fingerprint?: string;
  input: unknown;
  data: unknown;
  retired?: boolean;
  rerun?: (request: RerunRequest) => Promise<void>;
}) {
  const t = useTranslations("cards");
  const translate = useTranslate();
  const entry = opId !== undefined ? getOperationEntry(opId) : undefined;
  const title = entry?.label ?? genericTitle(toolName, t);

  const fields = useMemo(() => fieldsFor(toolName, entry?.fields, t), [toolName, entry, t]);
  const fieldsByKey = useMemo(() => Object.fromEntries(fields.map((field) => [field.key, field])), [fields]);
  const params = useMemo(() => extractRequestParams(toolName, input) ?? {}, [toolName, input]);
  const alternatives = useMemo<ProposalAlternative[]>(
    () =>
      toolName === "execute_protocol_action"
        ? filterAlternatives(
            (input as { alternatives?: unknown })?.alternatives,
            (actionType) => getOperationEntry(actionType) !== undefined,
          )
        : [],
    [toolName, input],
  );
  const seed = useMemo<FormValues>(() => seedFormState(fields, params), [fields, params]);

  const canAct = !retired && rerun !== undefined;
  const editable = canAct && fields.length > 0;

  // Seed once per tool call; re-seed only when the part identity changes.
  const [seededId, setSeededId] = useState(toolCallId);
  const [form, setForm] = useState<FormValues>(seed);
  const [errors, setErrors] = useState<Record<string, FieldError>>({});
  const [submitted, setSubmitted] = useState(false);
  const [blockedNote, setBlockedNote] = useState("");
  if (toolCallId !== seededId) {
    setSeededId(toolCallId);
    setForm(seed);
    setErrors({});
    setSubmitted(false);
    setBlockedNote("");
  }

  const dirty = editable && isDirty(fields, seed, form);
  const editedStatusId = useId();

  function onFieldChange(key: string, value: unknown): void {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (Object.hasOwn(current, key) ? omitKey(current, key) : current));
    setBlockedNote("");
  }

  async function onRun(): Promise<void> {
    if (!editable || submitted || rerun === undefined) return;
    const built = buildParams(fields, form);
    const issues = validateEdit(toolName, opId, built, input);
    if (issues.length > 0) {
      const mapped = mapIssuesToFieldErrors(issues, fieldsByKey, translate);
      setErrors(mapped);
      const visibleKeys = new Set(fields.filter((field) => isFieldVisible(field, form)).map((field) => field.key));
      const anyVisible = Object.keys(mapped).some((key) => visibleKeys.has(key));
      setBlockedNote(anyVisible ? "" : t("read.blocked"));
      return;
    }
    setErrors({});
    setBlockedNote("");
    setSubmitted(true);
    try {
      await rerun(buildRerunRequest(toolName, opId, built, alternatives, input, fingerprint));
    } catch {
      // The chat's error banner reports a failed re-run.
    } finally {
      setSubmitted(false);
    }
  }

  async function onSwitchOperation(next: string): Promise<void> {
    if (rerun === undefined || submitted || next === opId) return;
    const alternative = alternatives.find((item) => item.actionType === next);
    // Carry the other alternatives forward, a way back to this one included, so the fresh card still offers a switch.
    const forwardAlternatives: ProposalAlternative[] = [
      ...(opId !== undefined ? [{ actionType: opId, ...(Object.keys(params).length > 0 ? { params } : {}) }] : []),
      ...alternatives,
    ].filter((item) => item.actionType !== next);
    setSubmitted(true);
    try {
      const args: Record<string, unknown> = { actionType: next, params: alternative?.params ?? {} };
      if (forwardAlternatives.length > 0) args.alternatives = forwardAlternatives;
      await rerun({ tool: "execute_protocol_action", args, supersedesToolCallId: toolCallId });
    } catch {
      // The chat's error banner reports a failed re-run.
    } finally {
      setSubmitted(false);
    }
  }

  const hasRequest = fields.length > 0 || Object.keys(params).length > 0;
  const link = contractLink(data);
  const labelFor = resultLabel(entry?.outputFields);

  return (
    <ReceiptCard
      toolName={opId ?? toolName}
      metaRight={retired ? t("read.meta.replaced") : dirty ? t("read.meta.edited") : t("read.meta.read")}
      tone={dirty ? "pending" : "default"}
    >
      <p className="text-[15px] font-medium text-foreground">{title}</p>

      {canAct && alternatives.length > 0 && opId !== undefined && (
        <div className="mt-3">
          <Label className="mb-1.5">{t("read.alternatives")}</Label>
          <OptionSwitch
            label={t("read.alternatives")}
            options={[
              { value: opId, label: title },
              ...alternatives.map((item) => ({
                value: item.actionType,
                label: item.label ?? getOperationEntry(item.actionType)?.label ?? item.actionType,
              })),
            ]}
            value={opId}
            onChange={onSwitchOperation}
            disabled={submitted}
            commitOnFocus={false}
          />
        </div>
      )}

      {hasRequest && (
        <div className="mt-3">
          <Label>{t("read.request")}</Label>
          {editable ? (
            <div className="divide-y divide-border/60">
              {fields
                .filter((field) => isFieldVisible(field, form))
                .map((field) => (
                  <FieldEditor
                    key={field.key}
                    spec={field}
                    value={form[field.key]}
                    onChange={(value) => onFieldChange(field.key, value)}
                    error={errors[field.key]}
                    disabled={submitted}
                  />
                ))}
            </div>
          ) : (
            <div className="mt-1 divide-y divide-border/60">
              {Object.entries(params).map(([key, value]) => (
                <Row key={key} k={paramLabel(key, entry?.fields)} v={<ResultValue value={value} />} />
              ))}
            </div>
          )}
        </div>
      )}

      {editable && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={onRun} disabled={!dirty || submitted} className={GHOST_BUTTON}>
            {t("read.runAgain")}
          </button>
          <span role="status" className="text-[12px] text-fg-muted">
            {submitted ? t("read.working") : blockedNote}
          </span>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <Label>{t("read.result")}</Label>
          {link !== undefined && <ExplorerLink href={link} label={t("read.contract")} />}
        </div>
        <div className="mt-1">
          <ResultRows data={readResult(data)} labelFor={labelFor} />
        </div>
      </div>

      {retired && (
        <p className="mt-3 border-t border-border/60 pt-3 text-[12px] text-fg-muted">{t("read.replaced")}</p>
      )}

      <span id={editedStatusId} role="status" className="sr-only">
        {dirty ? t("read.edited") : ""}
      </span>
    </ReceiptCard>
  );
}

/** The same schema the model path uses, so a bad edit stays in the card. */
function validateEdit(
  toolName: string,
  opId: string | undefined,
  built: Record<string, unknown>,
  input: unknown,
): Array<{ path: string; message: string }> {
  let schema;
  let value: unknown = built;
  if (toolName === "execute_protocol_action" && opId !== undefined) {
    schema = getInputSchema(opId);
  } else if (toolName === "execute_contract_call") {
    schema = INPUT_SCHEMAS.execute_contract_call;
    const stateMutability = (input as { stateMutability?: unknown })?.stateMutability;
    value = { ...built, ...(stateMutability !== undefined ? { stateMutability } : {}) };
  } else if (toolName === "get_wallet_integration") {
    schema = INPUT_SCHEMAS.get_wallet_integration;
  }
  if (schema === undefined) return [];
  const parsed = schema.safeParse(value);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

function buildRerunRequest(
  toolName: string,
  opId: string | undefined,
  built: Record<string, unknown>,
  alternatives: ProposalAlternative[],
  input: unknown,
  fingerprint: string | undefined,
): RerunRequest {
  if (toolName === "execute_contract_call") {
    const stateMutability = (input as { stateMutability?: unknown })?.stateMutability;
    return {
      tool: "execute_contract_call",
      args: { ...built, ...(stateMutability !== undefined ? { stateMutability } : {}) },
    };
  }
  if (toolName === "get_wallet_integration") {
    return { tool: "get_wallet_integration", args: built };
  }
  const args: Record<string, unknown> = { actionType: opId, params: built };
  if (alternatives.length > 0) args.alternatives = alternatives;
  return { tool: "execute_protocol_action", args, ...(fingerprint !== undefined ? { fingerprint } : {}) };
}

function fieldsFor(toolName: string, entryFields: FieldSpec[] | undefined, t: CardsTranslator): FieldSpec[] {
  if (toolName === "execute_protocol_action") return entryFields ?? [];
  if (toolName === "execute_contract_call") return contractCallFields(t);
  if (toolName === "get_wallet_integration") return walletFields(t);
  return [];
}

function extractRequestParams(toolName: string, input: unknown): Record<string, unknown> | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  if (toolName === "execute_protocol_action") {
    return record.params !== null && typeof record.params === "object" && !Array.isArray(record.params)
      ? (record.params as Record<string, unknown>)
      : undefined;
  }
  if (toolName === "execute_contract_call") {
    return pruneUndefined({
      chain_id: record.chain_id,
      contract_address: record.contract_address,
      function_name: record.function_name,
      function_args: record.function_args,
      abi: record.abi,
    });
  }
  if (toolName === "get_wallet_integration") {
    return pruneUndefined({ integrationId: record.integrationId });
  }
  return undefined;
}

function paramLabel(key: string, entryFields: FieldSpec[] | undefined): string {
  return entryFields?.find((field) => field.key === key)?.label ?? humanizeKey(key);
}

function resultLabel(outputFields: Array<{ field: string; description: string }> | undefined): (key: string) => string {
  return (key: string) =>
    outputFields?.find((field) => field.field === key || field.field === `result.${key}`)?.description ?? humanizeKey(key);
}

function genericTitle(toolName: string, t: CardsTranslator): string {
  switch (toolName) {
    case "execute_contract_call":
      return t("read.title.contractRead");
    case "get_wallet_integration":
      return t("read.title.walletIntegration");
    default:
      return t("read.title.read");
  }
}

function pruneUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function omitKey<T extends Record<string, unknown>>(record: T, key: string): T {
  const rest: Record<string, unknown> = {};
  for (const [candidate, value] of Object.entries(record)) {
    if (candidate !== key) rest[candidate] = value;
  }
  return rest as T;
}
