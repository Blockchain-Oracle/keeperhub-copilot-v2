import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AccountProvider } from "@/components/shell/account-context";
import { AppStrip } from "@/components/shell/app-strip";
import { CommandPaletteProvider } from "@/components/shell/command/command-palette";
import { Header } from "@/components/shell/header/header";
import { Marquee } from "@/components/shell/marquee";
import { NetworkProvider } from "@/components/shell/network-context";
import { SignInProvider } from "@/components/shell/sign-in/sign-in";
import { WriteRecovery } from "@/components/shell/write-recovery";
import { Toaster } from "@/components/ui/toast";
import { NETWORK_COOKIE_NAME, parseNetworkCookie } from "@/lib/network";

import "./shell.css";

/*
 * The app shell — Masayume app/layout.tsx + components/shell/ShellChrome.tsx:
 * the strip, then the ticker, header and page, with one toast at a time.
 * Changes: it wraps only the app's routes (the landing keeps Portaldot's
 * floating nav); no footer, custom cursor or grain element — Portaldot's
 * globals already lay grain over every page, and the chat page is full height.
 * One sign-in modal for every Connect, and write recovery once per visit
 * (Masayume mounts WriteRecovery in its providers).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const initialChainId = parseNetworkCookie((await cookies()).get(NETWORK_COOKIE_NAME)?.value);

  return (
    <NetworkProvider initialChainId={initialChainId}>
      <AccountProvider>
        <SignInProvider>
          <CommandPaletteProvider>
            <AppStrip />
            <Toaster limit={1}>
              <WriteRecovery />
              <Marquee />
              <Header />
              {/* Clears the fixed chrome: strip + ticker (28) + header (64) = 92, and on phones 20 + 46 = 66.
                  The bottom pad keeps content clear of the floating phone pill. */}
              <main className="min-h-screen pt-[calc(var(--appstrip)+92px)] pb-24 max-[720px]:pt-[calc(var(--appstrip)+66px)] max-[720px]:pb-28">
                {children}
              </main>
            </Toaster>
          </CommandPaletteProvider>
        </SignInProvider>
      </AccountProvider>
    </NetworkProvider>
  );
}
