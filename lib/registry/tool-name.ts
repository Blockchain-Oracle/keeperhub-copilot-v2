/*
 * opId <-> toolName wire encoding (Story 1.3, spine AD-3).
 *
 * The canonical operation id is KeeperHub's own slug ("plugin/action", or a
 * bare label like "HTTP Request" for the 5 system primitives). OpenAI chat and
 * Realtime function names must match ^[a-zA-Z0-9_-]{1,64}$, which forbids the
 * slug's "/" and the system ids' spaces. toolName exists ONLY at the OpenAI
 * wire boundary; opId stays the sole identity everywhere internal.
 *
 * "_" is reserved as the escape character: "__" encodes "/", "_xx" encodes any
 * other illegal ASCII char by hex code. This is unambiguous because KeeperHub
 * slugs are validated kebab-case (lowercase letters, digits, hyphens) and so
 * never contain a bare underscore; a literal "_" in an id is escaped as "_5f".
 * Names that exceed 64 chars are truncated with a deterministic hash suffix
 * and are NOT algorithmically reversible - the generated registry's
 * bidirectional toolName <-> opId map is the authoritative reverse.
 */

export const OPENAI_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

const MAX_TOOL_NAME_LENGTH = 64;
// "_h" + 8 hex chars. "h" can never appear in a valid "_xx" hex escape, so a
// truncated name always fails algorithmic decoding instead of round-tripping
// to garbage.
const HASH_SUFFIX_LENGTH = 10;
const PASSTHROUGH = /^[a-zA-Z0-9-]$/;

/** FNV-1a 32-bit - dependency-free and stable; the generator asserts global
 *  toolName uniqueness across all ops, so a collision fails the build. */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function encodeToolName(opId: string): string {
  let encoded = "";
  for (const char of opId) {
    const code = char.codePointAt(0) as number;
    if (code > 0x7f) {
      throw new Error(
        `Cannot encode op id "${opId}": non-ASCII character "${char}". ` +
          "KeeperHub ids are ASCII by construction - investigate the snapshot.",
      );
    }
    if (PASSTHROUGH.test(char)) {
      encoded += char;
    } else if (char === "/") {
      encoded += "__";
    } else {
      encoded += `_${code.toString(16).padStart(2, "0")}`;
    }
  }
  if (encoded.length > MAX_TOOL_NAME_LENGTH) {
    encoded = `${encoded.slice(0, MAX_TOOL_NAME_LENGTH - HASH_SUFFIX_LENGTH)}_h${fnv1a(opId)}`;
  }
  return encoded;
}

/**
 * Algorithmic reverse of encodeToolName. Returns null for names that cannot
 * be decoded (hash-truncated or malformed) - callers fall back to the
 * registry's toolName -> opId map, which is authoritative.
 */
export function decodeToolName(toolName: string): string | null {
  let decoded = "";
  let i = 0;
  while (i < toolName.length) {
    const char = toolName[i];
    if (char !== "_") {
      decoded += char;
      i += 1;
      continue;
    }
    if (toolName[i + 1] === "_") {
      decoded += "/";
      i += 2;
      continue;
    }
    const hex = toolName.slice(i + 1, i + 3);
    if (!/^[0-9a-f]{2}$/.test(hex)) {
      return null;
    }
    decoded += String.fromCharCode(Number.parseInt(hex, 16));
    i += 3;
  }
  // A hash-truncated name decodes to garbage that re-encodes differently;
  // round-trip verification catches it without tracking truncation state.
  return encodeToolName(decoded) === toolName ? decoded : null;
}
