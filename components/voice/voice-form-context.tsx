"use client";

import { createContext, useContext } from "react";

/*
 * The form voice is filling in above its bar, by tool call id (decision 33).
 * Its card in the chat steps aside while the sheet holds it, so one form is
 * never answered twice; when voice ends the id goes back to null and the card
 * can be filled in right there.
 */
export const VoiceFormContext = createContext<string | null>(null);

export function useVoiceFormId(): string | null {
  return useContext(VoiceFormContext);
}
