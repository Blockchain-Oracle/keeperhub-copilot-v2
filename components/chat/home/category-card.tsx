"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

import type { Category } from "./categories";
import { Motif, type MotifFacts } from "./motifs";

/*
 * DeepBookie components/chat/chatHome/CategoryCard.tsx — one 246×188 rail card:
 * family dot and label, title, description, motif, the quoted prompt strip that
 * inverts on hover. Changes: Portaldot inks (ink hover → border-strong; the
 * strip inverts to primary, the action colour); the family label is mono like
 * Portaldot's meta strips; the entrance is Portaldot's `animate-rise` with
 * DeepBookie's stagger; no "Connect wallet to use" state, because signed out
 * the identity card stands where the launcher would be.
 */

const CARD =
  "group relative flex h-[188px] w-[246px] shrink-0 snap-start flex-col overflow-hidden rounded-card border-[1.5px] border-card-bezel bg-card px-[15px] pt-[14px] pb-[13px] text-left shadow-[var(--lift-card)]";
const HOVER =
  "animate-rise cursor-pointer transition-[transform,box-shadow,border-color] duration-200 [transition-timing-function:cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1 hover:border-card-bezel-strong hover:shadow-[var(--lift-card-hover)] focus-visible:outline-2 focus-visible:outline-ring active:-translate-y-px active:scale-[0.992]";

function Header({ category }: { category: Category }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${category.dot}`} />
        <span className="font-mono text-[8.5px] font-bold tracking-[0.1em] text-fg-muted uppercase">{category.familyLabel}</span>
      </span>
    </div>
  );
}

function Body({ category, facts }: { category: Category; facts: MotifFacts }) {
  return (
    <>
      <div className="mt-0.5 mb-[3px] text-[14.5px] font-bold tracking-[-0.02em] text-foreground">{category.title}</div>
      <div className="text-[11.5px] leading-[1.35] text-fg-secondary">{category.description}</div>
      <Motif kind={category.motif} facts={facts} />
    </>
  );
}

function Prompt({ text }: { text: string }) {
  const t = useTranslations("chat.home");
  return (
    <div className="mt-auto flex items-center gap-1.5 rounded-[8px] border border-border bg-surface-2 px-2.5 py-[7px] font-mono text-[10.5px] text-fg-secondary transition-[background,color,border-color] duration-200 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
      <span className="min-w-0 flex-1 truncate">{t("quoted", { text })}</span>
      <span className="ml-auto flex-none transition-transform duration-200 group-hover:translate-x-0.5">→</span>
    </div>
  );
}

export function CategoryCard({
  category,
  index,
  facts,
  onAction,
}: {
  category: Category;
  index: number;
  facts: MotifFacts;
  onAction: (text: string) => void;
}) {
  const style = { animationDelay: `${0.04 + index * 0.06}s` } as const;

  if (category.href) {
    return (
      <Link href={category.href} className={`${CARD} ${HOVER}`} style={style}>
        <Header category={category} />
        <Body category={category} facts={facts} />
        <Prompt text={category.description} />
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => onAction(category.prompt ?? "")} className={`${CARD} ${HOVER}`} style={style}>
      <Header category={category} />
      <Body category={category} facts={facts} />
      <Prompt text={category.prompt ?? ""} />
    </button>
  );
}
