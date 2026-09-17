"use client";

import { ChevronDown, ExternalLink, Wallet } from "lucide-react";

import { Address } from "@/components/data/address";
import { CopyChip } from "@/components/data/copy-chip";
import { ExplorerLink } from "@/components/data/explorer-link";
import { Hash } from "@/components/data/hash";
import { Identicon } from "@/components/data/identicon";
import { ChainMark, TokenMark } from "@/components/data/marks";
import { Money } from "@/components/data/money";
import { UtcTime } from "@/components/data/utc-time";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogEyebrow,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster, toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MAINNET_IDS, TESTNET_IDS } from "@/lib/chains";

/*
 * Every slice-1 building block on one page, so they can be judged running.
 * Sample values are labelled samples, not data.
 */

const SAMPLE_ADDRESS = "0x7a3f9c2b5e8d1f4a6b0c3e5d7f9a1b2c4d6e4e21";
const SAMPLE_HASH = "0x9f3c1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f";
const SAMPLE_MS = Date.UTC(2026, 8, 12, 14, 5, 9);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-1 ring-1 ring-border-strong/70">
      <div className="rounded-[calc(var(--radius)*1.5)] border border-border bg-card receipt-watermark">
        <div className="flex items-center gap-2 px-4 py-2 font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-telemetry glow-telemetry" />
          {title}
        </div>
        <div className="perforation" />
        <div className="flex flex-wrap items-center gap-3 px-4 pt-3 pb-4">{children}</div>
      </div>
    </section>
  );
}

export function FoundationGallery() {
  return (
    <TooltipProvider>
      <Toaster limit={1}>
        <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-10">
          <header className="mb-2">
            <p className="font-mono text-[10px] tracking-[0.22em] text-fg-muted uppercase">Slice 1 · review page</p>
            <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">
              Foundation<span className="text-primary">.</span>
            </h1>
            <p className="mt-2 text-sm text-fg-secondary">
              Samples on this page are placeholders for looking at the parts, not real data.
            </p>
          </header>

          <Section title="Type & colour">
            <span className="font-display text-2xl">Anek Latin display</span>
            <span className="text-sm">Geist body</span>
            <span className="font-mono text-sm tabular-nums">Geist Mono 0123456789</span>
            <span className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">primary</span>
            <span className="text-telemetry text-xs">telemetry</span>
            <span className="text-success text-xs">success</span>
            <span className="text-pending text-xs">pending</span>
            <span className="text-destructive text-xs">destructive</span>
          </Section>

          <Section title="Button · input · separator · skeleton">
            <Button>Default</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Input placeholder="Input" className="w-48" />
            <Separator orientation="vertical" className="h-6" />
            <Skeleton className="h-6 w-32" />
          </Section>

          <Section title="Tooltip · tabs">
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" />}>Hover me</TooltipTrigger>
              <TooltipContent>Tooltip content</TooltipContent>
            </Tooltip>
            <Tabs defaultValue="one">
              <TabsList>
                <TabsTrigger value="one">One</TabsTrigger>
                <TabsTrigger value="two">Two</TabsTrigger>
              </TabsList>
              <TabsContent value="one" className="text-fg-secondary">First panel</TabsContent>
              <TabsContent value="two" className="text-fg-secondary">Second panel</TabsContent>
            </Tabs>
          </Section>

          <Section title="Menu · dialog · sheet · toast">
            <Menu>
              <MenuTrigger
                render={<Button variant="outline" className="data-popup-open:[&_svg]:rotate-180 [&_svg]:transition-transform" />}
              >
                Build <ChevronDown />
              </MenuTrigger>
              <MenuContent sideOffset={8} align="start" className="w-64">
                <MenuGroup>
                  <MenuGroupLabel>Automate</MenuGroupLabel>
                  <MenuItem>Automations</MenuItem>
                  <MenuItem>Actions</MenuItem>
                </MenuGroup>
                <MenuSeparator />
                <MenuGroup>
                  <MenuItem>
                    Docs <ExternalLink className="ml-auto size-3.5" />
                  </MenuItem>
                </MenuGroup>
              </MenuContent>
            </Menu>

            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogEyebrow>KEEPERHUB · CONNECT</DialogEyebrow>
                  <DialogTitle>Dialog title</DialogTitle>
                  <DialogDescription>Head, scrolling body and a footer that stays put.</DialogDescription>
                </DialogHeader>
                <div className="perforation mx-7 my-2" />
                <DialogBody>
                  <p className="text-sm text-fg-secondary">Body content.</p>
                </DialogBody>
                <DialogFooter>
                  <Button className="h-10 w-full rounded-full">
                    <Wallet /> Primary action
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Sheet>
              <SheetTrigger render={<Button variant="outline" />}>Open sheet</SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Sheet title</SheetTitle>
                  <SheetDescription>Right-side drawer.</SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>

            <Button variant="outline" onClick={() => toast.add({ title: "Neutral toast", description: "Swipe or wait." })}>
              Toast
            </Button>
            <Button variant="outline" onClick={() => toast.add({ title: "Warning toast", type: "warning" })}>
              Warning toast
            </Button>
          </Section>

          <Section title="Money · address · hash · time">
            <Money value={1234567890000000000n} decimals={18} maxDp={4} symbol="ETH" />
            <Money value={-4200000n} decimals={6} tone="pnl" symbol="USDC" />
            <Address value={SAMPLE_ADDRESS} />
            <Hash value={SAMPLE_HASH} href="https://sepolia.basescan.org" />
            <UtcTime ms={SAMPLE_MS} withDate />
            <CopyChip value={SAMPLE_ADDRESS} />
            <ExplorerLink href="https://sepolia.basescan.org" label="Basescan" />
            <Identicon address={SAMPLE_ADDRESS} size={28} halo />
            <Identicon address="0x1111111111111111111111111111111111111111" size={28} />
          </Section>

          <Section title="Chain marks">
            {[...MAINNET_IDS, ...TESTNET_IDS, "999999"].map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5 font-mono text-[11px] text-fg-secondary">
                <ChainMark chainId={id} size={20} /> {id}
              </span>
            ))}
          </Section>

          <Section title="Token marks">
            {["ETH", "POL", "BNB", "SOL", "USDT", "USDC", "DAI"].map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 font-mono text-[11px] text-fg-secondary">
                <TokenMark symbol={s} size={20} /> {s}
              </span>
            ))}
          </Section>
        </main>
      </Toaster>
    </TooltipProvider>
  );
}
