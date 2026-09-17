"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { ChainMark } from "@/components/data/marks";
import { NetworkMenuGroups } from "@/components/shell/header/network-pill";
import { usePlatformChains } from "@/components/shell/use-platform-chains";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { getChain } from "@/lib/chains";
import type { FieldSpec } from "@/lib/registry";
import { cn } from "@/lib/utils";

import type { FieldError } from "../editable.ts";

/*
 * A network field for a write card. FieldEditor's row grammar (mono label,
 * hero-pill input, error beside it) around the header network pill's menu, so
 * the choices are KeeperHub's live list, narrowed to the networks the action
 * accepts. Additive: v1 had no network edit.
 */
export function NetworkField({
  spec,
  value,
  onChange,
  error,
  disabled = false,
}: {
  spec: FieldSpec;
  value: unknown;
  onChange: (value: string) => void;
  error?: FieldError;
  disabled?: boolean;
}) {
  const t = useTranslations("cards");
  const chains = usePlatformChains();
  const chainId = typeof value === "string" ? value : "";
  const liveChain = chains.status === "ready" ? chains.chains.find((chain) => chain.chainId === chainId) : undefined;
  const name = chainId === "" ? t("fields.chooseNetwork") : (liveChain?.name ?? getChain(chainId).name);
  const labelId = useId();
  const errorId = `${labelId}-error`;

  return (
    <div className={cn("py-2", error !== undefined && "border-l-2 border-destructive pl-3")}>
      <span id={labelId} className="font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase">
        {spec.label}
        {spec.required ? (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> {t("fields.required")}</span>
          </>
        ) : null}
      </span>
      <div className="mt-1.5">
        <Menu modal={false}>
          <MenuTrigger
            disabled={disabled}
            aria-labelledby={labelId}
            aria-describedby={error !== undefined ? errorId : undefined}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-[13px] text-foreground outline-none transition-colors hover:border-border-strong focus-visible:border-primary disabled:opacity-40 data-popup-open:border-primary"
          >
            {chainId !== "" && <ChainMark chainId={chainId} name={name} size={16} />}
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <ChevronDown aria-hidden="true" className="size-3.5 text-fg-muted" />
          </MenuTrigger>
          <MenuContent sideOffset={6} className="w-64">
            <NetworkMenuGroups value={chainId} onValueChange={onChange} allowedIds={spec.allowedChainIds} />
          </MenuContent>
        </Menu>
      </div>
      {error !== undefined ? (
        <p id={errorId} className="mt-1 text-[12px] font-medium text-destructive">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
