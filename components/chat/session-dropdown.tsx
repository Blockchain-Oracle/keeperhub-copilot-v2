"use client";

import { Popover } from "@base-ui/react/popover";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useId, useState, useRef, type ReactNode } from "react";

import { UtcTime } from "@/components/data/utc-time";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorMessage } from "@/lib/i18n/use-translate";
import { cn } from "@/lib/utils";

import { NEW_CONVERSATION_TITLE, renameChanged } from "./chat-rules";

/*
 * DeepBookie components/chat/ChatSessionDropdown.tsx — the conversation switcher
 * as a dropdown above the chat, at every breakpoint: a pill with the current
 * title, then "+ New chat", a CONVERSATIONS label and the org's conversations.
 *
 * Changes: built on Base UI Popover with the ui/menu panel paint and motion
 * (Masayume owns dropdowns); the list is fetched fresh on each open, and each row
 * renames in place and deletes, from v1 components/chat/ThreadSwitcher.tsx
 * (DeepBookie has neither). Rows link to the conversation's own page; deleting
 * the open conversation starts a new chat. Times are absolute UTC (Masayume).
 */

type ListItem = { id: string; title: string; updatedAt: string };

const TITLE_MAX_LENGTH = 120;

export function SessionDropdown({
  currentId,
  title,
  onNew,
  onRenamed,
}: {
  currentId?: string;
  title: string;
  onNew: () => void;
  onRenamed: (id: string, title: string) => void;
}) {
  const t = useTranslations("chat");
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  // null = loading (one skeleton row); [] = the honest empty state.
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  // The nonce re-keys the live region so a repeated message is announced again.
  const [status, setStatus] = useState({ message: "", nonce: 0 });
  // Guards a slow response from an earlier open overwriting this one's.
  const generation = useRef(0);

  const announce = (message: string) => setStatus((current) => ({ message, nonce: current.nonce + 1 }));
  // An unnamed conversation's stored title is the English sentinel; it reads in the person's language.
  const shownTitle = (item: ListItem) => (item.title === NEW_CONVERSATION_TITLE ? t("newConversation") : item.title);

  function load() {
    setItems(null);
    setFailed(false);
    const mine = ++generation.current;
    fetch("/api/conversations", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Conversation list failed with ${res.status}.`);
        return (await res.json()) as { conversations: ListItem[] };
      })
      .then((json) => {
        if (generation.current === mine) setItems(json.conversations);
      })
      .catch((error: unknown) => {
        console.error("Conversation list failed", error);
        if (generation.current === mine) {
          setFailed(true);
          setItems([]);
        }
      });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      load();
    } else {
      setEditingId(null);
      setEditError(null);
    }
  }

  function startNew() {
    setOpen(false);
    onNew();
  }

  async function commitRename(item: ListItem) {
    const nextTitle = editValue.trim();
    // Nothing new to save closes the box without a request (an unnamed conversation keeps its sentinel).
    if (!renameChanged(item.title, shownTitle(item), editValue)) {
      setEditingId(null);
      setEditError(null);
      return;
    }
    if (nextTitle.length > TITLE_MAX_LENGTH) return setEditError(t("sessionDropdown.titleTooLong", { max: TITLE_MAX_LENGTH }));
    try {
      const res = await fetch(`/api/conversations/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        return setEditError(errorMessage(json?.error?.code, json?.error?.message ?? t("sessionDropdown.renameFailed")));
      }
      setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, title: nextTitle } : row)) ?? current);
      setEditingId(null);
      setEditError(null);
      onRenamed(item.id, nextTitle);
      announce(t("sessionDropdown.renamed"));
    } catch (error) {
      console.error("Conversation rename failed", error);
      setEditError(t("sessionDropdown.renameFailed"));
    }
  }

  async function deleteItem(item: ListItem) {
    try {
      const res = await fetch(`/api/conversations/${item.id}`, { method: "DELETE" });
      if (!res.ok) return announce(t("sessionDropdown.deleteFailed"));
      announce(t("sessionDropdown.deleted"));
      if (item.id === currentId) return startNew();
      setItems((current) => current?.filter((row) => row.id !== item.id) ?? current);
    } catch (error) {
      console.error("Conversation delete failed", error);
      announce(t("sessionDropdown.deleteFailed"));
    }
  }

  return (
    <>
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger className="group/session flex max-w-[min(70vw,300px)] items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-2.5 pl-3 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring data-popup-open:bg-surface-2">
          <ChatGlyph />
          <span className="truncate">{title}</span>
          <span aria-hidden className="text-[9px] text-fg-muted transition-transform group-data-popup-open/session:rotate-180">
            ▼
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={8} className="isolate z-[920] outline-none">
            <Popover.Popup
              aria-label={t("sessionDropdown.conversations")}
              className={cn(
                "w-[min(88vw,18rem)] origin-(--transform-origin) overflow-hidden rounded-[0.75rem] border border-border-strong bg-card/95 text-foreground backdrop-blur outline-none",
                "[transition:opacity_160ms_cubic-bezier(0.4,0,0.2,1),transform_200ms_cubic-bezier(0.22,1,0.36,1)]",
                "data-starting-style:opacity-0 data-starting-style:[transform:translateY(-0.4rem)_scale(0.98)] data-ending-style:opacity-0 data-ending-style:[transform:translateY(-0.4rem)_scale(0.98)]",
              )}
            >
              <button
                type="button"
                onClick={startNew}
                className="flex w-full items-center gap-2.5 border-b border-border px-3.5 py-3 text-left text-[13px] font-medium text-primary transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              >
                <span aria-hidden className="grid size-5 place-items-center rounded-full border border-primary/40 text-[13px] leading-none">
                  +
                </span>
                {t("sessionDropdown.newChat")}
              </button>

              <div className="px-3.5 pt-2.5 pb-1 font-mono text-[0.62rem] font-bold tracking-[0.14em] text-fg-muted uppercase">
                {t("sessionDropdown.conversations")}
              </div>
              <div className="max-h-[min(50vh,320px)] overflow-y-auto pb-1.5">
                {items === null && (
                  <div className="px-3.5 py-1.5">
                    <Skeleton className="h-9 w-full" />
                  </div>
                )}
                {failed && <p className="px-3.5 py-3 text-[11.5px] text-fg-muted">{t("sessionDropdown.loadFailed")}</p>}
                {items !== null && !failed && items.length === 0 && (
                  <p className="px-3.5 py-3 text-[11.5px] text-fg-muted">{t("sessionDropdown.empty")}</p>
                )}
                {items?.map((item) =>
                  editingId === item.id ? (
                    <RenameRow
                      key={item.id}
                      title={shownTitle(item)}
                      value={editValue}
                      error={editError}
                      onChange={setEditValue}
                      onCommit={() => void commitRename(item)}
                      onCancel={() => {
                        setEditingId(null);
                        setEditError(null);
                      }}
                    />
                  ) : (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-0.5 pr-1.5 transition-colors hover:bg-surface-2",
                        item.id === currentId && "bg-surface-2",
                      )}
                    >
                      <Link
                        href={`/app/c/${item.id}`}
                        onClick={() => setOpen(false)}
                        aria-current={item.id === currentId ? "page" : undefined}
                        className="flex min-w-0 flex-1 flex-col gap-0.5 px-3.5 py-2 text-left focus-visible:bg-surface-2 focus-visible:outline-none"
                      >
                        <span className="truncate text-[12.5px] font-medium text-foreground">{shownTitle(item)}</span>
                        <UtcTime ms={Date.parse(item.updatedAt)} withDate withSeconds={false} className="text-[10px] text-fg-muted" />
                      </Link>
                      <RowButton
                        label={t("sessionDropdown.rename", { title: shownTitle(item) })}
                        onClick={() => {
                          setEditingId(item.id);
                          setEditValue(shownTitle(item));
                          setEditError(null);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </RowButton>
                      <RowButton label={t("sessionDropdown.delete", { title: shownTitle(item) })} onClick={() => void deleteItem(item)}>
                        <Trash2 className="size-3.5" />
                      </RowButton>
                    </div>
                  ),
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <p role="status" className="sr-only">
        <span key={status.nonce}>{status.message}</span>
      </p>
    </>
  );
}

function RowButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}

function RenameRow({
  title,
  value,
  error,
  onChange,
  onCommit,
  onCancel,
}: {
  /** The conversation's title as the list shows it. */
  title: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("chat.sessionDropdown");
  const inputId = useId();
  const errorId = useId();
  // Stable identity, so focus lands once on mount and never again per keystroke.
  const focusOnMount = useCallback((element: HTMLInputElement | null) => element?.focus(), []);
  return (
    <div className="bg-surface-2 px-3.5 py-2">
      <label htmlFor={inputId} className="sr-only">
        {t("newTitle", { title })}
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        ref={focusOnMount}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit();
          }
          if (event.key === "Escape") {
            // Cancels the edit only; the dropdown stays open.
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? errorId : undefined}
        className="h-7 w-full rounded-md border border-border-strong bg-card px-2 text-[12.5px] text-foreground outline-none focus-visible:border-primary"
      />
      {error !== null && (
        <p id={errorId} className="mt-1 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ChatGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-fg-muted" aria-hidden>
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2v-7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
