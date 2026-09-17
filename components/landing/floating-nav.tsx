"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { buttonVariants } from "@/components/ui/button";
import { DiamondMark } from "@/components/ui/diamond-mark";
import { cn } from "@/lib/utils";
import { MenuToggleIcon } from "@/components/ui/menu-toggle-icon";
import { useScroll } from "@/components/ui/use-scroll";

/*
 * Ported verbatim from references/portaldot-mcp/packages/web/components/ui/floating-nav.tsx.
 * Substituted: the nav labels, the wordmark and the GitHub URL. The diamond glyph is
 * Portaldot's own — a geometric placeholder until KeeperHub has a mark here.
 *
 * Text: messages/en/landing.json (decision 41).
 */

// Each label lives under landing.floatingNav.links.<label>.
const NAV = [
	{ label: "features", href: "/#features" },
	{ label: "how", href: "/#how" },
	{ label: "install", href: "/#install" },
	{ label: "docs", href: "/docs" },
] as const;

const GITHUB_URL = "https://github.com/KeeperHub/keeperhub";

/**
 * Floating-pill nav — Instrument Panel. Fixed-top, backdrop-blurred, shrinks
 * on scroll past 200px (spring-eased via tailwind transition tokens). On
 * mobile, the same hamburger sheet portal as the old header.
 */
export function FloatingNav() {
	const t = useTranslations("landing");
	const [open, setOpen] = React.useState(false);
	const compressed = useScroll(200);

	React.useEffect(() => {
		document.body.style.overflow = open ? "hidden" : "";
		return () => {
			document.body.style.overflow = "";
		};
	}, [open]);

	return (
		<>
			<header
				className={cn(
					"fixed top-4 left-1/2 -translate-x-1/2 z-50",
					"flex items-center gap-2",
					"rounded-full border border-border-strong bg-card/70 backdrop-blur-xl",
					"shadow-[0_2px_24px_-8px_rgba(0,0,0,0.6)]",
					"transition-[max-width,height,padding] duration-500",
					"px-3",
					// max-width caps for desktop; on mobile we always span the width
					"w-[calc(100%-1.5rem)] md:w-auto",
					compressed ? "md:max-w-[640px] h-11" : "md:max-w-[760px] h-14",
				)}
				style={{ transitionTimingFunction: "var(--ease-snap, cubic-bezier(0.32,0.72,0,1))" }}
			>
				{/* Brand */}
				<Link
					href="/"
					className="flex items-center gap-2 rounded-full px-1.5 py-1 text-foreground transition-opacity hover:opacity-80"
				>
					<DiamondMark className="size-5 text-primary" />
					<span
						className={cn(
							"font-semibold tracking-tight text-sm transition-[opacity,width] duration-300 overflow-hidden",
							compressed ? "md:opacity-0 md:max-w-0" : "md:opacity-100 md:max-w-[140px]",
						)}
					>
						KeeperHub Copilot
					</span>
				</Link>

				{/* Desktop nav */}
				<nav className="ml-2 hidden items-center gap-0.5 md:flex">
					{NAV.map((link) => (
						<Link
							key={link.label}
							href={link.href}
							className={cn(
								buttonVariants({ variant: "ghost", size: "sm" }),
								"rounded-full text-[13px] font-medium text-fg-secondary hover:text-foreground",
							)}
						>
							{t(`floatingNav.links.${link.label}`)}
						</Link>
					))}
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						aria-label="GitHub"
						className={cn(
							buttonVariants({ variant: "ghost", size: "icon-sm" }),
							"rounded-full text-fg-secondary hover:text-foreground",
						)}
					>
						<GithubGlyph className="size-4" />
					</a>
				</nav>

				{/* Pill-within-pill CTA — desktop */}
				<Link
					href="/app"
					className={cn(
						"hidden md:inline-flex items-center gap-1.5 ml-auto rounded-full",
						"bg-primary hover:bg-primary-press text-primary-foreground",
						"px-3.5 h-8 text-[13px] font-semibold",
						"transition-[transform,filter] hover:-translate-y-px hover:brightness-110",
						"shadow-[0_0_18px_-4px_oklch(0.66_0.22_288/55%)]",
					)}
				>
					{t("floatingNav.openApp")}
					<ArrowGlyph className="size-3.5" />
				</Link>

				{/* Mobile hamburger */}
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					aria-expanded={open}
					aria-controls="mobile-menu"
					aria-label={open ? t("floatingNav.closeMenu") : t("floatingNav.openMenu")}
					className={cn(
						"ml-auto md:hidden",
						"flex size-9 items-center justify-center rounded-full",
						"border border-border bg-card/40 text-foreground",
						"hover:border-border-strong transition-colors",
					)}
				>
					<MenuToggleIcon open={open} className="size-5" duration={250} />
				</button>
			</header>

			<MobileSheet open={open} onClose={() => setOpen(false)} />
		</>
	);
}

function MobileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	const t = useTranslations("landing");
	if (typeof window === "undefined" || !open) return null;
	return createPortal(
		<div
			id="mobile-menu"
			className={cn(
				"fixed inset-0 top-20 z-40 md:hidden",
				"bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur-xl",
				"border-t border-border",
				"flex flex-col gap-1 p-4",
				"animate-in fade-in zoom-in-95 ease-out duration-200",
			)}
			onClick={onClose}
		>
			{NAV.map((link) => (
				<Link
					key={link.label}
					href={link.href}
					className={cn(
						buttonVariants({ variant: "ghost", className: "w-full justify-start rounded-xl text-base h-12" }),
					)}
				>
					{t(`floatingNav.links.${link.label}`)}
				</Link>
			))}
			<a
				href={GITHUB_URL}
				target="_blank"
				rel="noreferrer"
				className={cn(
					buttonVariants({ variant: "outline", className: "w-full justify-start rounded-xl text-base h-12" }),
				)}
			>
				GitHub
			</a>
			<div className="mt-2 grid">
				<Link
					href="/app"
					className={cn(
						"inline-flex items-center justify-center gap-1.5 rounded-xl h-12 text-base font-semibold",
						"bg-primary text-primary-foreground hover:bg-primary-press",
						"shadow-[0_0_20px_-6px_oklch(0.66_0.22_288/60%)]",
					)}
				>
					{t("floatingNav.openApp")}
					<ArrowGlyph className="size-4" />
				</Link>
			</div>
		</div>,
		document.body,
	);
}

function GithubGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
			<path d="M12 .5C5.7.5.6 5.6.6 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.7 1.2 3.3.9.1-.7.4-1.2.7-1.5-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.4 5.6 18.3.5 12 .5Z" />
		</svg>
	);
}

function ArrowGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
			<path d="M3 8H13M13 8L8.5 3.5M13 8L8.5 12.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
