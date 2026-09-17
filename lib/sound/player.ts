/*
 * Playing a cue.
 *
 * One AudioContext for the page, built on the first cue rather than on load —
 * a context created before a gesture starts suspended, and browsers are right
 * to insist on that. Every path here is allowed to fail silently: a browser
 * with no Web Audio, a device with no output, a tab that has never been
 * touched. A cue that does not play is never worth an error.
 */

import { CUES, type CueName } from "./cues";

const STORAGE_KEY = "kh_sound";

let context: AudioContext | null = null;
let master: GainNode | null = null;

/** Null until it has been read once, so the first read can fall back to on. */
let muted: boolean | null = null;

function readMuted(): boolean {
  if (muted !== null) return muted;
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) === "off";
  } catch {
    // private windows, blocked site data — sound stays on, nothing is recorded
    muted = false;
  }
  return muted;
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  return readMuted();
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "off" : "on");
  } catch {
    // the preference just does not survive the visit
  }
  if (next && context) void context.suspend().catch(() => {});
}

function ensureContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 1;
    master.connect(context.destination);
  } catch {
    context = null;
    master = null;
  }
  return context;
}

/**
 * Plays a cue, if sound is on and the browser will have it.
 *
 * Call it from something the person did. Called from anywhere else the context
 * is still suspended and the cue is simply dropped, which is the correct
 * outcome — a page should not make noise at nobody.
 */
export function play(name: CueName): void {
  if (typeof window === "undefined") return;
  if (readMuted()) return;

  const ctx = ensureContext();
  if (!ctx || !master) return;

  if (ctx.state === "suspended") void ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  for (const note of CUES[name]) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type;
      osc.frequency.value = note.freq;

      // A 6ms attack and an exponential fall. Ramping to zero is not allowed
      // on an exponential curve, so it lands on a value below hearing and is
      // then cut, which avoids the click a hard stop would leave.
      const start = now + note.at;
      const end = start + note.dur;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(end + 0.02);
    } catch {
      // one note failing should not take the rest of the cue with it
    }
  }
}
