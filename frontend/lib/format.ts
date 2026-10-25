// Pure helpers: no imports, so `node --test` can load this file directly.

const WEI_PER_GEN = 10n ** 18n;
const ISO_UTC_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
const SNAPSHOT_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

/**
 * Converts an amount returned by readContract to wei without precision loss.
 * genlayer-js returns integers <= 2^53 as numbers and larger ones as decimal strings.
 */
export function toWei(value: unknown): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error("Amount must not be negative.");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Amount is not an exact non-negative integer: ${value}`);
    }
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(`Amount is not a non-negative integer: ${String(value)}`);
}

/** Parses a GEN amount typed by a user ("0.3", "12") into wei. At most 18 decimals. */
export function parseGen(text: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,18}))?$/.exec(text.trim());
  if (!match) throw new Error("Enter a GEN amount such as 0.1, with at most 18 decimal places.");
  return BigInt(match[1]) * WEI_PER_GEN + BigInt((match[2] ?? "").padEnd(18, "0"));
}

/** Formats wei as GEN with every significant decimal kept: 10 wei is "0.00000000000000001". */
export function formatWei(value: unknown): string {
  const wei = toWei(value);
  const whole = wei / WEI_PER_GEN;
  const frac = (wei % WEI_PER_GEN).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function formatGen(value: unknown, symbol = "GEN"): string {
  return `${formatWei(value)} ${symbol}`;
}

export function shortAddress(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** Parses the contract's ISO UTC timestamps ("2026-10-23T20:22:11Z"); null if malformed. */
export function parseIsoUtc(value: string): Date | null {
  const m = ISO_UTC_RE.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return date.toISOString().slice(0, 19) === value.slice(0, 19) ? date : null;
}

/** "2026-10-23 20:22:11 UTC" */
export function formatUtc(value: string): string {
  const date = parseIsoUtc(value);
  if (!date) return value;
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 19)} UTC`;
}

/** The same instant in the viewer's time zone, for display next to the UTC value. */
export function formatLocal(value: string, locale?: string): string {
  const date = parseIsoUtc(value);
  if (!date) return value;
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZoneName: "short" });
}

/** "20261023202211" -> "2026-10-23T20:22:11Z"; null if not a valid 14-digit timestamp. */
export function snapshotToIso(ts: string): string | null {
  const m = SNAPSHOT_RE.exec(ts);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  return parseIsoUtc(iso) ? iso : null;
}

/** "2026-10-23T20:22:11Z" -> "20261023202211", the form the contract compares snapshots in. */
export function isoToSnapshot(value: string): string | null {
  const m = ISO_UTC_RE.exec(value);
  return m && parseIsoUtc(value) ? m.slice(1).join("") : null;
}

/** "2 d 4 h", "3 h 12 min", "45 s"; for indicative countdowns only. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${total % 60} s`;
}
