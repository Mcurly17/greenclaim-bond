// Mirrors constants of contracts/green_claim_bond.py. tests/rules.test.ts fails
// if any of them drifts from the contract source.
import type { Rule } from "./contracts/types.ts";

export const RULE_TEXT: Record<Rule, string> = {
  R1:
    "Generic environmental claim without specification. A broad environmental claim " +
    'such as "eco-friendly", "green", "environmentally friendly", "sustainable", ' +
    '"climate friendly", "biodegradable" or an equivalent in another language ' +
    '(e.g. "eco-responsable", "respectueux de l\'environnement", "durable") is a ' +
    "violation when no clear, specific and visible explanation of that environmental " +
    "performance appears on the same page.",
  R2:
    "Climate claim based on offsetting. A claim that a product has a neutral, reduced, " +
    "compensated or positive impact on the climate or on greenhouse gas emissions " +
    '(e.g. "carbon neutral", "climate neutral", "CO2 compensated", "neutre en carbone") ' +
    "is a violation when it relies on offsetting emissions (carbon credits, compensation " +
    "or tree-planting projects) rather than on the actual life-cycle impact of the " +
    "product itself.",
  R3:
    "Unofficial sustainability label. Displaying a sustainability label (a named label, " +
    "seal, badge or logo presented as a certification) is a violation when it is not " +
    "based on a certification scheme with independent third-party verification and is " +
    "not established by a public authority, for instance a label created by the brand " +
    "itself.",
};

/** The first sentence of each rule, used as its short title. */
export function ruleTitle(rule: Rule): string {
  const text = RULE_TEXT[rule];
  return text.slice(0, text.indexOf(". ") + 1);
}

export const LIMITS = {
  MAX_PAGES: 5,
  MIN_DAYS: 1,
  MAX_DAYS: 365,
  MIN_PAYOUT: 10,
  NAME_MAX_LEN: 80,
  URL_MAX_LEN: 512,
  QUOTE_MIN_LEN: 10,
  QUOTE_MAX_LEN: 240,
  REASON_MAX_LEN: 280,
  MAX_REDIRECTS: 2,
  RESOLVE_WINDOW_DAYS: 3,
} as const;
