"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

import { StatusTicker } from "./status-ticker";

/*
 * The hero.
 *
 * Structure ported from references/portaldot-mcp/packages/web/components/landing/hero.tsx.
 * Everything load-bearing in that file is here: the full-bleed canvas behind
 * the content, the floor gradient that fades the animation into the page, the
 * vignette that darkens the corners so the eye stays on the copy, the
 * instrument chip above the headline, the display-font headline with one
 * italic word and a coloured full stop, and the pill composer that takes a
 * real prompt and carries it into the app.
 *
 * The canvas is Portaldot's own r3f wave (./hero-wave, verbatim), dynamically
 * imported so three.js never enters the SSR bundle, exactly as Portaldot does.
 *
 * Text: messages/en/landing.json (decision 41).
 */
const HeroWave = dynamic(() => import("./hero-wave"), { ssr: false });

const ROTATING_PROMPTS = ["price", "balances", "send", "supply", "gas"] as const;

export function Hero() {
  const router = useRouter();
  const t = useTranslations("landing");
  const [prompt, setPrompt] = useState("");
  const prompts = useMemo(() => ROTATING_PROMPTS.map((key) => t(`hero.prompts.${key}`)), [t]);
  const placeholder = useTypewriterPlaceholder(
    prompts,
    prompt.length === 0,
    t("hero.placeholder"),
  );

  function submit() {
    const text = prompt.trim();
    router.push(text ? `/app?prompt=${encodeURIComponent(text)}` : "/app");
  }

  return (
    <section className="relative isolate flex min-h-[92vh] items-center overflow-hidden">
      {/* The animated canvas sits behind everything. */}
      <div className="absolute inset-0 -z-10">
        <HeroWave />
      </div>

      {/* Floor gradient — pulls the bottom to the page colour so the wave
          dissolves into the next section instead of stopping at an edge. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-2/3"
        style={{
          background:
            "linear-gradient(to top, var(--background) 8%, transparent 90%)",
        }}
      />
      {/* Vignette — darkens the corners to hold the eye on the copy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at center 30%, transparent 0%, var(--background) 92%)",
        }}
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pt-32 pb-20 text-center">
        <StatusTicker />

        <h1
          className="mt-7 text-balance text-5xl font-medium leading-[1.02] tracking-[-0.025em] text-foreground sm:text-6xl md:text-7xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t.rich("hero.title", {
            em: (chunks) => <em className="font-medium italic text-foreground">{chunks}</em>,
            stop: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
        </h1>

        <p className="mt-6 max-w-xl text-balance text-base leading-relaxed text-fg-secondary sm:text-lg">
          {t.rich("hero.subtitle", {
            highlight: (chunks) => <span className="text-foreground">{chunks}</span>,
          })}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mt-9 w-full max-w-2xl"
        >
          <div
            className={
              "group relative flex items-center gap-2 rounded-full border border-border-strong " +
              "bg-card/70 px-2 py-2 backdrop-blur-xl " +
              "shadow-[0_8px_36px_-12px_rgba(0,0,0,0.55)] " +
              "transition-colors focus-within:border-primary"
            }
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={placeholder}
              aria-label={t("hero.inputLabel")}
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent px-4 py-2 text-[15px] text-foreground outline-none placeholder:text-fg-muted"
            />
            <button
              type="submit"
              aria-label={t("hero.submit")}
              className={
                "inline-flex shrink-0 items-center gap-1.5 rounded-full " +
                "bg-primary px-4 h-10 text-[13px] font-semibold text-primary-foreground " +
                "transition-[transform,filter] hover:-translate-y-px hover:brightness-110 " +
                "shadow-[0_0_22px_-4px_oklch(0.66_0.22_288/65%)]"
              }
            >
              <span className="hidden sm:inline">{t("hero.submit")}</span>
              <ArrowRight className="size-4" />
            </button>
          </div>
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
            {t("hero.enterHint")}
          </p>
        </form>
      </div>
    </section>
  );
}

/* Typewriter placeholder — types a prompt, holds, erases, advances. Runs only
 * while the input is empty. Ported from Portaldot's hook of the same name. */
function useTypewriterPlaceholder(prompts: string[], active: boolean, idle: string): string {
  const [text, setText] = useState("");
  const stateRef = useRef({
    i: 0,
    j: 0,
    deleting: false,
    t: 0 as unknown as ReturnType<typeof setTimeout>,
  });
  const list = useMemo(() => prompts.slice(), [prompts]);

  useEffect(() => {
    if (!active) {
      clearTimeout(stateRef.current.t);
      // Reset on the next tick, not in the effect body (react-hooks/set-state-in-effect).
      const reset = setTimeout(() => setText(""), 0);
      return () => clearTimeout(reset);
    }
    const TYPE_MS = 38;
    const ERASE_MS = 22;
    const HOLD_MS = 1500;
    const BETWEEN_MS = 400;

    function step() {
      const s = stateRef.current;
      const current = list[s.i % list.length];
      if (!s.deleting) {
        if (s.j < current.length) {
          s.j += 1;
          setText(current.slice(0, s.j));
          s.t = setTimeout(step, TYPE_MS);
        } else {
          s.deleting = true;
          s.t = setTimeout(step, HOLD_MS);
        }
      } else if (s.j > 0) {
        s.j -= 1;
        setText(current.slice(0, s.j));
        s.t = setTimeout(step, ERASE_MS);
      } else {
        s.deleting = false;
        s.i = (s.i + 1) % list.length;
        s.t = setTimeout(step, BETWEEN_MS);
      }
    }

    stateRef.current = {
      i: 0,
      j: 0,
      deleting: false,
      t: setTimeout(step, 600),
    };
    return () => clearTimeout(stateRef.current.t);
  }, [list, active]);

  return active ? text || idle : idle;
}
