'use client';
import React from 'react';

/*
 * Portaldot components/ui/use-scroll.tsx, same result. Read through
 * useSyncExternalStore instead of setState-in-effect, which React 19's
 * react-hooks/set-state-in-effect rule rejects.
 */

function subscribe(onChange: () => void) {
	window.addEventListener('scroll', onChange);
	return () => window.removeEventListener('scroll', onChange);
}

export function useScroll(threshold: number) {
	return React.useSyncExternalStore(
		subscribe,
		() => window.scrollY > threshold,
		() => false,
	);
}
