/*
 * The screen captures the guides point at.
 *
 * The rule these follow: the image on disk is the app, untouched. Every arrow,
 * number and label is drawn on a separate layer from the coordinates here, so a
 * capture can be retaken without redrawing anything, and nothing in the picture
 * can say something the app does not.
 *
 * `state` records what was on screen when it was taken and `capturedAt` when —
 * so a capture that has drifted from the app is visible as drift rather than
 * quietly becoming a lie. `x`/`y` are percentages of the capture, which keeps
 * them right whatever size it is displayed at.
 *
 * A name with no entry renders as a marked gap, not a broken image.
 */

export interface GuideAnnotation {
  /** Where the numbered dot sits, in percent of the capture. */
  x: number;
  y: number;
  /** Where its arrow points, in percent of the capture. */
  toX: number;
  toY: number;
  label: string;
}

export interface Guide {
  /** Described for someone who cannot see it, not repeated from the caption. */
  alt: string;
  width: number;
  height: number;
  /** What the app was showing. Signed in? Which network? Real data or empty? */
  state: string;
  /** YYYY-MM-DD. */
  capturedAt: string;
  annotations: GuideAnnotation[];
}

export const GUIDES: Record<string, Guide> = {};

export function getGuide(name: string): Guide | undefined {
  return GUIDES[name];
}

export function guideImagePath(name: string): string {
  return `/guides/${name}.png`;
}
