// Pure parsing of query-string parameters (?id=, ?address=).

/** "0", "17" -> number; anything else (empty, "-1", "1.5", "01x", huge) -> null. */
export function parseIdParam(value: string | null | undefined): number | null {
  if (value == null || !/^\d{1,15}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

/** A 0x-prefixed 40-hex-digit address, trimmed; null otherwise. */
export function parseAddressParam(value: string | null | undefined): `0x${string}` | null {
  const trimmed = (value ?? "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? (trimmed as `0x${string}`) : null;
}
