// Pure display logic for pledge and challenge states, mirroring the contract checks.
import type { ChallengeStatus } from "./contracts/types.ts";
import { parseIsoUtc } from "./format.ts";

export const CHALLENGE_LABEL: Record<ChallengeStatus, string> = {
  OPEN: "Open",
  UPHELD: "Challenge upheld",
  REJECTED: "Challenge rejected",
  QUOTE_NOT_FOUND: "Quote not found",
  EXPIRED: "Expired",
};

/** What the contract's _settle did with the stake and the reserved payout. */
export const CHALLENGE_SETTLEMENT: Record<ChallengeStatus, string> = {
  OPEN: "The payout is reserved from the bond until the challenge is resolved or expires.",
  UPHELD: "The challenger received the stake back plus the payout, taken from the bond.",
  REJECTED: "The stake was added to the bond; the reserved payout was released.",
  QUOTE_NOT_FOUND:
    "The quote was not found in the snapshot. The stake was added to the bond; the reserved payout was released.",
  EXPIRED: "Not resolved in time. The stake was refunded; the reserved payout was released.",
};

export function challengeLabel(status: string): string {
  return (CHALLENGE_LABEL as Record<string, string>)[status] ?? status;
}

export type PledgeState = "active" | "ended" | "withdrawn";

/**
 * "active": challenges are accepted. "ended": coverage is over (challenge refused
 * when now >= ends_at). "withdrawn": the brand withdrew, active is false.
 */
export function pledgeState(p: { active: boolean; ends_at: string }, nowMs: number): PledgeState {
  if (!p.active) return "withdrawn";
  const ends = parseIsoUtc(p.ends_at);
  return ends && nowMs >= ends.getTime() ? "ended" : "active";
}

export const PLEDGE_LABEL: Record<PledgeState, string> = {
  active: "Active",
  ended: "Coverage ended",
  withdrawn: "Bond withdrawn",
};

export type ResolveWindow = "resolvable" | "expirable" | "settled";

/** resolve works up to resolve_deadline inclusive; expire only strictly after it. */
export function resolveWindow(c: { status: string; resolve_deadline: string }, nowMs: number): ResolveWindow {
  if (c.status !== "OPEN") return "settled";
  const deadline = parseIsoUtc(c.resolve_deadline);
  if (!deadline) return "resolvable";
  // The contract compares whole seconds, so the deadline second itself still resolves.
  return Math.floor(nowMs / 1000) * 1000 <= deadline.getTime() ? "resolvable" : "expirable";
}
