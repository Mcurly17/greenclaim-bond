// Pure client-side mirrors of the contract checks, so users see a clear message
// before signing. The contract stays the authority: these only pre-empt its errors.
import type { ChallengeView, PledgeView } from "./contracts/types.ts";
import { parseGen, parseIsoUtc, snapshotToIso, toWei } from "./format.ts";
import { LIMITS } from "./rules.ts";

// _PUNCT_MAP in the contract.
const PUNCT: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'", "\u2032": "'", "\u00b4": "'", "`": "'",
  "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"', "\u2033": '"',
  "\u00ab": '"', "\u00bb": '"', "\u2039": '"', "\u203a": '"',
  "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2212": "-",
};

const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const URL_RE = /^https:\/\/([^/?#\s]+)([^#\s]*)(?:#\S*)?$/i;
const RULE_IDS: readonly string[] = ["R1", "R2", "R3"];

/** The contract's _compact: punctuation map, NFKC, whitespace collapsed and trimmed. */
export function compact(text: string): string {
  const mapped = Array.from(text, (ch) => PUNCT[ch] ?? ch).join("");
  return mapped.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

/** Length as Python's len() counts it: in code points, not UTF-16 units. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

export function normalizeDomain(domain: string): string | null {
  let d = domain.trim().toLowerCase().replace(/\.+$/, "");
  if (d.startsWith("www.")) d = d.slice(4);
  return DOMAIN_RE.test(d) ? d : null;
}

/** Returns an error message for a page URL the contract would refuse, or null. */
export function pageError(raw: string, domain: string): string | null {
  const url = raw.trim();
  if (url.length > LIMITS.URL_MAX_LEN) return "page URL too long";
  const m = URL_RE.exec(url);
  if (!m) return "pages must be https URLs";
  const authority = m[1];
  if (authority.includes("@")) return "page URL must not contain credentials";
  let host = authority.toLowerCase();
  const colon = host.lastIndexOf(":");
  if (colon !== -1) {
    if (host.slice(colon + 1) !== "443") return "page URL must use the default https port";
    host = host.slice(0, colon);
  }
  host = host.replace(/\.+$/, "");
  if (host !== domain && host !== `www.${domain}`) return `page is not on domain ${domain}`;
  if (Array.from(m[2]).some((ch) => ch.charCodeAt(0) < 0x21 || ch.charCodeAt(0) === 0x7f)) {
    return "page URL contains control characters";
  }
  return null;
}

export type Errors<K extends string> = Partial<Record<K, string>>;

export interface CreateInput {
  name: string;
  domain: string;
  /** One URL per line. */
  pages: string;
  payout: string;
  days: string;
  bond: string;
}

/** Arguments of create_pledge(name, domain, pages_json, payout, days), with the bond as value. */
export interface CreateCall {
  name: string;
  domain: string;
  pagesJson: string;
  payoutWei: string;
  days: number;
  valueWei: string;
}

function gen(text: string): bigint | null {
  try {
    return parseGen(text);
  } catch {
    return null;
  }
}

export function validateCreate(input: CreateInput): { errors: Errors<keyof CreateInput>; call: CreateCall | null } {
  const errors: Errors<keyof CreateInput> = {};
  const name = input.name.replace(/\s+/gu, " ").trim();
  if (name === "" || codePointLength(name) > LIMITS.NAME_MAX_LEN) {
    errors.name = `Name must be 1 to ${LIMITS.NAME_MAX_LEN} characters.`;
  }
  const domain = normalizeDomain(input.domain);
  if (!domain) errors.domain = "Enter a domain such as example.com.";

  const pages = input.pages.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
  if (pages.length < 1 || pages.length > LIMITS.MAX_PAGES) {
    errors.pages = `List 1 to ${LIMITS.MAX_PAGES} page URLs, one per line.`;
  } else if (domain) {
    for (const page of pages) {
      const problem = pageError(page, domain);
      if (problem) {
        errors.pages = `${page}: ${problem}.`;
        break;
      }
    }
  }

  const payout = gen(input.payout);
  if (payout === null) errors.payout = "Enter the payout in GEN, for example 0.1.";
  else if (payout < BigInt(LIMITS.MIN_PAYOUT)) errors.payout = `Payout must be at least ${LIMITS.MIN_PAYOUT} wei.`;

  const bond = gen(input.bond);
  if (bond === null || bond <= 0n) errors.bond = "Enter the bond in GEN, greater than 0.";
  else if (payout !== null && bond < payout) errors.bond = "The bond must be at least the payout.";

  const days = /^\d{1,3}$/.test(input.days.trim()) ? Number(input.days.trim()) : NaN;
  if (!(days >= LIMITS.MIN_DAYS && days <= LIMITS.MAX_DAYS)) {
    errors.days = `Coverage must be ${LIMITS.MIN_DAYS} to ${LIMITS.MAX_DAYS} days.`;
  }

  const encodable = payout !== null && bond !== null && Number.isInteger(days);
  const call: CreateCall | null = encodable
    ? {
        name: input.name,
        domain: input.domain,
        pagesJson: JSON.stringify(pages),
        payoutWei: payout.toString(),
        days,
        valueWei: bond.toString(),
      }
    : null;
  return { errors, call };
}

export interface ChallengeInput {
  pageIndex: number;
  rule: string;
  quote: string;
  snapshotTs: string;
  stake: string;
}

export interface ChallengeCall {
  args: [number, number, string, string, string];
  valueWei: string;
}

/** Mirrors the checks of challenge() in the order the contract applies them. */
export function validateChallenge(
  input: ChallengeInput,
  ctx: { pledge: PledgeView; challenges: ChallengeView[]; account: string | null; nowMs: number },
): { errors: Errors<keyof ChallengeInput | "pledge">; call: ChallengeCall | null } {
  const { pledge, challenges, account, nowMs } = ctx;
  const errors: Errors<keyof ChallengeInput | "pledge"> = {};
  const ends = parseIsoUtc(pledge.ends_at);
  if (!pledge.active) errors.pledge = "This pledge is no longer active.";
  else if (ends && nowMs >= ends.getTime()) errors.pledge = "Coverage of this pledge has ended.";
  else if (account && account.toLowerCase() === pledge.brand.toLowerCase()) {
    errors.pledge = "The brand cannot challenge its own pledge.";
  }

  const stake = gen(input.stake);
  const minStake = toWei(pledge.min_stake);
  if (stake === null || stake <= 0n || stake < minStake) errors.stake = "The stake must be at least the minimum stake.";

  if (!RULE_IDS.includes(input.rule)) errors.rule = "Choose R1, R2 or R3.";
  if (!(input.pageIndex >= 0 && input.pageIndex < pledge.pages.length)) errors.pageIndex = "Choose one of the covered pages.";

  const length = codePointLength(compact(input.quote));
  if (length < LIMITS.QUOTE_MIN_LEN || length > LIMITS.QUOTE_MAX_LEN) {
    errors.quote = `The quote must be ${LIMITS.QUOTE_MIN_LEN} to ${LIMITS.QUOTE_MAX_LEN} characters after spaces are collapsed (now ${length}).`;
  }

  const snapshotIso = snapshotToIso(input.snapshotTs.trim());
  const created = parseIsoUtc(pledge.created_at);
  if (!snapshotIso) errors.snapshotTs = "Enter the 14-digit Wayback timestamp (YYYYMMDDhhmmss).";
  else {
    const snapshotMs = Date.parse(snapshotIso);
    if (snapshotMs > nowMs) errors.snapshotTs = "This capture timestamp is in the future.";
    else if (created && snapshotMs < created.getTime()) errors.snapshotTs = "The capture must be taken after the pledge was created.";
  }

  if (!errors.pageIndex && !errors.rule) {
    const open = challenges.find((c) => c.status === "OPEN" && c.page_index === input.pageIndex && c.rule === input.rule);
    if (open) errors.rule = `Challenge ${open.id} is already open on this page for ${input.rule}.`;
  }
  if (toWei(pledge.bond) - toWei(pledge.reserved) < toWei(pledge.payout)) {
    errors.pledge ??= "The bond cannot cover another payout right now.";
  }

  const call: ChallengeCall | null =
    stake !== null
      ? { args: [pledge.id, input.pageIndex, input.rule, input.quote, input.snapshotTs.trim()], valueWei: stake.toString() }
      : null;
  return { errors, call };
}

/** withdraw needs now >= ends_at and something left after reservations; it does not check `active`. */
export function canWithdraw(pledge: PledgeView, account: string | null, nowMs: number): boolean {
  const ends = parseIsoUtc(pledge.ends_at);
  return (
    account !== null &&
    account.toLowerCase() === pledge.brand.toLowerCase() &&
    toWei(pledge.available) > 0n &&
    ends !== null &&
    nowMs >= ends.getTime()
  );
}

export function isBrand(pledge: PledgeView, account: string | null): boolean {
  return account !== null && account.toLowerCase() === pledge.brand.toLowerCase();
}
