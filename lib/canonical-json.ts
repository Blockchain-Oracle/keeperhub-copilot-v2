/*
 * Canonical JSON with sorted object keys, verbatim from the AI SDK's
 * canonical-hash. The approval signature hashes it on the server; the write
 * card hashes it for its document number, so both read one definition.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSON).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(record[k])}`);
  return `{${entries.join(",")}}`;
}
