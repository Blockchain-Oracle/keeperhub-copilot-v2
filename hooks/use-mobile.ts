import * as React from "react"

/*
 * Portaldot hooks/use-mobile.ts, same breakpoint and result. Read through
 * useSyncExternalStore instead of setState-in-effect, which React 19's
 * react-hooks/set-state-in-effect rule rejects.
 */

const MOBILE_BREAKPOINT = 768

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}
