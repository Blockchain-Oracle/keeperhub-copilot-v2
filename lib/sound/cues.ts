/*
 * The copilot's voices.
 *
 * Synthesised rather than sampled: no files to ship or fetch, nothing to go
 * stale in a cache, and every cue is a number you can change here.
 *
 * Three house rules, so these read as one instrument rather than a sound pack:
 *
 *   1. Everything is in D. A cue that arrives while another is still ringing
 *      has to agree with it, and the write ceremony fires several in a row.
 *   2. Nothing lasts more than a quarter of a second. These are punctuation.
 *   3. Nothing is loud. Peak gain is 0.09, which is roughly -21 dBFS, so a cue
 *      sits under speech rather than over it.
 *
 * And one product rule, which decides what gets a sound at all: reads are
 * silent. A question costs nothing and nothing is at stake, so answering one
 * makes no noise. Sound marks the ceremony — a card that wants something, the
 * click that commits, and how it ended.
 */

/** D major, the octave the cues live in. */
const D5 = 587.33;
const E5 = 659.25;
const FS5 = 739.99;
const A5 = 880.0;
const D4 = 293.66;
const A3 = 220.0;
const D3 = 146.83;

export type CueName =
  | "card"
  | "form"
  | "authorize"
  | "cancel"
  | "executed"
  | "void"
  | "voiceStart"
  | "voiceEnd";

export interface Note {
  freq: number;
  /** Seconds after the cue starts. */
  at: number;
  /** Seconds. */
  dur: number;
  gain: number;
  type: OscillatorType;
}

export const CUES: Record<CueName, Note[]> = {
  /** A card landed in the chat. The quietest thing here — it happens often. */
  card: [{ freq: A5, at: 0, dur: 0.05, gain: 0.03, type: "sine" }],

  /** The assistant needs something from you. Two notes up: a question. */
  form: [
    { freq: D5, at: 0, dur: 0.06, gain: 0.05, type: "sine" },
    { freq: A5, at: 0.07, dur: 0.08, gain: 0.05, type: "sine" },
  ],

  /** You committed. A triangle with almost no tail, so it reads as a click. */
  authorize: [
    { freq: D5, at: 0, dur: 0.04, gain: 0.09, type: "triangle" },
    { freq: FS5, at: 0.012, dur: 0.07, gain: 0.05, type: "sine" },
  ],

  /** You backed out. Flat, low, no resolution — nothing happened. */
  cancel: [{ freq: D4, at: 0, dur: 0.07, gain: 0.05, type: "triangle" }],

  /** It landed on chain. The only cue that finishes a chord. */
  executed: [
    { freq: D5, at: 0, dur: 0.1, gain: 0.055, type: "sine" },
    { freq: FS5, at: 0.06, dur: 0.1, gain: 0.05, type: "sine" },
    { freq: A5, at: 0.12, dur: 0.14, gain: 0.05, type: "sine" },
  ],

  /** It failed. The same root, an octave and a half down, and it stops there. */
  void: [
    { freq: D3, at: 0, dur: 0.16, gain: 0.07, type: "sine" },
    { freq: A3, at: 0.02, dur: 0.12, gain: 0.035, type: "sine" },
  ],

  /** Voice opened. */
  voiceStart: [
    { freq: D5, at: 0, dur: 0.07, gain: 0.045, type: "sine" },
    { freq: E5, at: 0.06, dur: 0.07, gain: 0.045, type: "sine" },
    { freq: A5, at: 0.12, dur: 0.1, gain: 0.045, type: "sine" },
  ],

  /** Voice closed. The same three, walked back down. */
  voiceEnd: [
    { freq: A5, at: 0, dur: 0.07, gain: 0.04, type: "sine" },
    { freq: E5, at: 0.06, dur: 0.07, gain: 0.04, type: "sine" },
    { freq: D5, at: 0.12, dur: 0.11, gain: 0.04, type: "sine" },
  ],
};
