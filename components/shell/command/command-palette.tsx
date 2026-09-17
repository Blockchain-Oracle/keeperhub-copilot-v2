"use client";

import { Check, Languages, Search, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { CatalogResponse } from "@/app/api/catalog/route";
import { postToChat } from "@/components/chat/chat-inbox";
import { IntegrationMark } from "@/components/data/integration-mark";
import { ChainMark } from "@/components/data/marks";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useTranslate } from "@/lib/i18n/use-translate";
import type { CatalogEntry } from "@/lib/palette-catalog";
import { cn } from "@/lib/utils";

import { useLocale, useSwitchLanguage } from "../locale-context";
import { useNetwork } from "../network-context";
import { usePlatformChains } from "../use-platform-chains";
import { actionItems, languageItems, networkItems, pageItems, searchPalette, type PaletteItem } from "./palette-items";

/*
 * The ⌘K palette (decision 36). DeepBookie apps/docs components/shell/
 * DocsShell.tsx (⌘K / Ctrl+K toggles it) and SearchModal.tsx: a search row with
 * an esc hint, results with a mark, a title and a mono line, the ↵ hint on the
 * active row, "No results for …", and the ↵ open / esc close / N results footer.
 * Its 580px panel sits 14vh from the top; its index loads on first open.
 *
 * Changes: our dialog and paint (a bottom sheet on phones, as every dialog);
 * three kinds of result instead of doc pages: a page opens, a network switches
 * in place, an action asks the chat about it. Arrow keys move through results,
 * as a listbox.
 */

type PaletteControls = { open: () => void };

const PaletteContext = createContext<PaletteControls | null>(null);

/** Opens the palette; null outside the app shell. */
export function useCommandPalette(): PaletteControls | null {
  return useContext(PaletteContext);
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const controls = useMemo<PaletteControls>(() => ({ open: () => setOpen(true) }), []);

  return (
    <PaletteContext value={controls}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="sm:mt-[14vh] sm:mb-auto sm:max-w-[580px]">
          <PaletteBody close={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </PaletteContext>
  );
}

// Loaded the first time the palette opens and kept for the visit; a failure lets the next open try again.
let catalogRequest: Promise<CatalogEntry[]> | null = null;

function loadCatalog(): Promise<CatalogEntry[]> {
  catalogRequest ??= fetch("/api/catalog", { headers: { accept: "application/json" } })
    .then(async (res) => {
      if (!res.ok) throw new Error(`catalog ${res.status}`);
      return ((await res.json()) as CatalogResponse).actions;
    })
    .catch((error: unknown) => {
      catalogRequest = null;
      throw error;
    });
  return catalogRequest;
}

/* Mounted only while the dialog is open, so every opening starts with an empty search. */
function PaletteBody({ close }: { close: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { chainId, setChainId } = useNetwork();
  const { locale } = useLocale();
  const switchLanguage = useSwitchLanguage();
  const chains = usePlatformChains();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [catalog, setCatalog] = useState<CatalogEntry[] | "error" | null>(null);
  const listId = useId();
  const t = useTranslations("shell.palette");
  const translate = useTranslate();

  useEffect(() => {
    let live = true;
    loadCatalog().then(
      (actions) => {
        if (live) setCatalog(actions);
      },
      () => {
        if (live) setCatalog("error");
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const pages = useMemo(() => pageItems(translate), [translate]);
  const networks = useMemo(
    () => networkItems(chains.status === "ready" ? chains.chains : [], chainId, translate),
    [chains, chainId, translate],
  );
  const languages = useMemo(() => languageItems(locale, translate), [locale, translate]);
  const actions = useMemo(() => (Array.isArray(catalog) ? actionItems(catalog) : []), [catalog]);
  const result = useMemo(
    () => searchPalette(query, { pages, networks, languages, actions }, translate),
    [query, pages, networks, languages, actions, translate],
  );
  const flat = useMemo(() => result.sections.flatMap((section) => section.items), [result]);
  const active = flat.length === 0 ? -1 : Math.min(activeIndex, flat.length - 1);
  const optionId = (index: number) => `${listId}-option-${index}`;
  const searching = query.trim() !== "";

  function choose(item: PaletteItem) {
    close();
    switch (item.kind) {
      case "page":
        router.push(item.href);
        return;
      case "network":
        if (!item.current) {
          setChainId(item.chainId);
          toast.add({ title: t("switched", { network: item.title }), description: t("switchedDescription") });
        }
        return;
      case "language":
        switchLanguage(item.code);
        return;
      case "action":
        if (!postToChat(item.prompt)) router.push(`/app?prompt=${encodeURIComponent(item.prompt)}`);
        return;
    }
  }

  function move(step: number) {
    if (flat.length === 0) return;
    const next = (active + step + flat.length) % flat.length;
    setActiveIndex(next);
    document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const item = flat[active];
      if (item !== undefined) choose(item);
    }
  }

  return (
    <>
      <DialogTitle className="sr-only">{t("title")}</DialogTitle>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
        <Search aria-hidden className="size-[18px] shrink-0 text-fg-muted" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-label={t("search")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("placeholder")}
          className="min-w-0 flex-1 bg-transparent font-mono text-[15px] text-foreground outline-none placeholder:text-fg-muted"
        />
        <kbd className="shrink-0 rounded-[5px] border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">esc</kbd>
      </div>

      <div id={listId} role="listbox" aria-label={t("results")} className="max-h-[min(54vh,30rem)] overflow-y-auto overscroll-contain p-2">
        {result.sections.map((section) => (
          <div key={section.kind} role="group" aria-label={section.label} className="pb-1">
            <div className="px-3 pt-2 pb-1 font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase">{section.label}</div>
            {section.items.map((item) => {
              const index = flat.indexOf(item);
              return (
                <Option
                  key={item.id}
                  id={optionId(index)}
                  item={item}
                  active={index === active}
                  here={item.kind === "page" && pathname === item.href}
                  onHover={() => setActiveIndex(index)}
                  onChoose={() => choose(item)}
                />
              );
            })}
            {section.kind === "action" && section.more > 0 && (
              <Link
                href="/docs/actions"
                onClick={close}
                className="block px-3 py-2 font-mono text-[11px] text-fg-muted transition-colors hover:text-foreground"
              >
                {t("moreActions", { count: section.more })}
              </Link>
            )}
            {section.kind === "network" && section.more > 0 && (
              <p className="px-3 py-2 font-mono text-[11px] text-fg-muted">{t("moreNetworks", { count: section.more })}</p>
            )}
          </div>
        ))}

        {searching && catalog === null && (
          <p role="status" className="px-3 py-2 font-mono text-[11px] text-fg-muted">
            {t("loadingActions")}
          </p>
        )}
        {searching && catalog === "error" && (
          <p className="px-3 py-2 font-mono text-[11px] text-fg-muted">{t("actionsFailed")}</p>
        )}
        {result.count === 0 && catalog !== null && (
          <div className="px-5 py-10 text-center">
            <p className="text-[15px] font-semibold text-foreground">{t("noResults", { query: query.trim() })}</p>
            <p className="mt-1.5 text-[13px] text-fg-muted">{t("noResultsHint")}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-border bg-surface-2/40 px-4 py-2.5 font-mono text-[10.5px] text-fg-muted max-[720px]:hidden">
        <span>↑↓ {t("move")}</span>
        <span>↵ {t("open")}</span>
        <span>esc {t("close")}</span>
        <span className="flex-1" />
        <span className="tabular-nums">{t("resultCount", { count: result.count })}</span>
      </div>
    </>
  );
}

function Option({
  id,
  item,
  active,
  here,
  onHover,
  onChoose,
}: {
  id: string;
  item: PaletteItem;
  active: boolean;
  here: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  const t = useTranslations("shell.palette");
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onMouseMove={active ? undefined : onHover}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 transition-colors",
        active ? "border-border bg-surface-2" : "border-transparent",
      )}
    >
      <span className="grid size-[30px] shrink-0 place-items-center rounded-lg border border-border bg-surface-2/60 text-fg-secondary">
        {item.kind === "page" ? (
          <item.icon aria-hidden className="size-3.5" />
        ) : item.kind === "network" ? (
          <ChainMark chainId={item.chainId} name={item.title} size={18} />
        ) : item.kind === "language" ? (
          <Languages aria-hidden className="size-3.5" />
        ) : (
          <IntegrationMark integration={item.integration} size={20} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span lang={item.kind === "language" ? item.code : undefined} className="truncate text-[14px] font-semibold text-foreground">
            {item.title}
          </span>
          {item.kind === "action" && item.signs && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-pending/40 bg-pending/10 px-1.5 py-0.5 text-[10px] font-medium text-pending">
              <Wallet aria-hidden className="size-3" /> {t("signs")}
            </span>
          )}
        </span>
        <span className="block truncate font-mono text-[11px] text-fg-muted">
          {item.kind === "action" ? `${item.subtitle} · ${item.id.slice("action:".length)}` : item.subtitle}
        </span>
      </span>
      {(item.kind === "network" || item.kind === "language") && item.current ? (
        <Check aria-label={t("selected")} className="size-4 shrink-0 text-primary" />
      ) : here ? (
        <span className="shrink-0 font-mono text-[10px] tracking-[0.14em] text-fg-muted uppercase">{t("here")}</span>
      ) : active ? (
        <span aria-hidden className="shrink-0 text-[13px] text-fg-muted">
          ↵
        </span>
      ) : null}
    </div>
  );
}
