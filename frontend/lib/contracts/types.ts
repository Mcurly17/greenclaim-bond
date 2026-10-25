// Shapes returned by the GreenClaimBond views (contracts/green_claim_bond.py).

/**
 * A wei amount as readContract returns it: a number up to 2^53, a decimal
 * string above. Always convert with toWei() from lib/format.ts.
 */
export type RawAmount = string | number;

export type ChallengeStatus = "OPEN" | "UPHELD" | "REJECTED" | "QUOTE_NOT_FOUND" | "EXPIRED";

export type Rule = "R1" | "R2" | "R3";

export const RULES: readonly Rule[] = ["R1", "R2", "R3"];

export const CHALLENGE_STATUSES: readonly ChallengeStatus[] = [
  "OPEN",
  "UPHELD",
  "REJECTED",
  "QUOTE_NOT_FOUND",
  "EXPIRED",
];

/** get_pledge(pledge_id) */
export interface PledgeView {
  id: number;
  brand: string;
  name: string;
  domain: string;
  pages: string[];
  bond: RawAmount;
  reserved: RawAmount;
  available: RawAmount;
  payout: RawAmount;
  min_stake: RawAmount;
  ends_at: string;
  active: boolean;
  created_at: string;
}

/** get_challenge(challenge_id) and each item of list_challenges(pledge_id) */
export interface ChallengeView {
  id: number;
  pledge_id: number;
  page_index: number;
  rule: Rule;
  quote: string;
  snapshot_ts: string;
  /** "" until the challenge is judged */
  judged_ts: string;
  challenger: string;
  stake: RawAmount;
  status: ChallengeStatus;
  reason: string;
  opened_at: string;
  resolve_deadline: string;
}

/** get_stats(): `pledges` and `challenges` are counters, so ids run from 0 to n - 1. */
export interface Stats {
  pledges: number;
  challenges: number;
  pool: RawAmount;
}

/** standing(brand) */
export interface Standing {
  brand: string;
  upheld: number;
  rejected: number;
}

export type ReadMethod = "get_stats" | "get_pledge" | "get_challenge" | "list_challenges" | "standing";

export type WriteMethod = "create_pledge" | "top_up" | "challenge" | "resolve" | "expire" | "withdraw";
