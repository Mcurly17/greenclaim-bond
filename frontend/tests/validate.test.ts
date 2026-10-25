import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChallengeView, PledgeView } from "../lib/contracts/types.ts";
import { resolveWindow } from "../lib/status.ts";
import {
  canWithdraw,
  codePointLength,
  compact,
  isBrand,
  normalizeDomain,
  pageError,
  validateChallenge,
  validateCreate,
  type ChallengeInput,
} from "../lib/validate.ts";

const BRAND = "0xef93A8E49cA11CACcE60C5236a9c3D326dcf32ed";
const OTHER = "0x1111111111111111111111111111111111111111";
const PAGE = "https://mcurly17.github.io/greenclaim-bond/gourde-verte.html";

const pledge: PledgeView = {
  id: 3,
  brand: BRAND,
  name: "Demo",
  domain: "mcurly17.github.io",
  pages: [PAGE],
  bond: "250000000000000000",
  reserved: 0,
  available: "250000000000000000",
  payout: "100000000000000000",
  min_stake: "10000000000000000",
  ends_at: "2026-10-26T12:00:00Z",
  active: true,
  created_at: "2026-10-25T12:00:00Z",
};
const DURING = Date.parse("2026-10-25T18:00:00Z");
const AFTER = Date.parse("2026-10-26T12:00:00Z");

const goodChallenge: ChallengeInput = {
  pageIndex: 0,
  rule: "R1",
  quote: "Notre gourde éco-responsable pour la planète.",
  snapshotTs: "20261025130000",
  stake: "0.01",
};

function openChallenge(over: Partial<ChallengeView> = {}): ChallengeView {
  return {
    id: 7,
    pledge_id: 3,
    page_index: 0,
    rule: "R1",
    quote: "x",
    snapshot_ts: "20261025130000",
    judged_ts: "",
    challenger: OTHER,
    stake: "10000000000000000",
    status: "OPEN",
    reason: "",
    opened_at: "2026-10-25T13:00:00Z",
    resolve_deadline: "2026-10-29T12:00:00Z",
    ...over,
  };
}

test("compact maps curly quotes and dashes, applies NFKC and collapses whitespace like the contract", () => {
  assert.equal(compact("  L\u2019eau \u2014 \u00abpure\u00bb\u00a0\n\t ici  "), "L'eau - \"pure\" ici");
  assert.equal(compact("\uff21\uff22"), "AB");
  assert.equal(compact("\ufb01ne"), "fine");
});

test("codePointLength counts code points as Python len() does", () => {
  assert.equal(codePointLength("🌍🌍"), 2);
  assert.equal("🌍🌍".length, 4);
});

test("normalizeDomain lowercases, strips www. and a trailing dot, rejects garbage", () => {
  assert.equal(normalizeDomain(" WWW.Example.COM. "), "example.com");
  assert.equal(normalizeDomain("mcurly17.github.io"), "mcurly17.github.io");
  assert.equal(normalizeDomain("localhost"), null);
  assert.equal(normalizeDomain("https://example.com"), null);
});

test("pageError mirrors the contract URL checks", () => {
  assert.equal(pageError(PAGE, "mcurly17.github.io"), null);
  assert.equal(pageError("https://WWW.example.com:443/a?b=1#c", "example.com"), null);
  assert.match(pageError("http://example.com/", "example.com") ?? "", /https/);
  assert.match(pageError("https://user@example.com/", "example.com") ?? "", /credentials/);
  assert.match(pageError("https://example.com:8443/", "example.com") ?? "", /port/);
  assert.match(pageError("https://other.com/", "example.com") ?? "", /domain/);
  assert.match(pageError(`https://example.com/${"a".repeat(600)}`, "example.com") ?? "", /too long/);
});

test("validateCreate accepts the scenario values and encodes amounts in wei", () => {
  const { errors, call } = validateCreate({
    name: "  Demo   gourde ",
    domain: "mcurly17.github.io",
    pages: `\n${PAGE}\n\n`,
    payout: "0.1",
    days: "1",
    bond: "0.2",
  });
  assert.deepEqual(errors, {});
  assert.ok(call);
  assert.equal(call.payoutWei, "100000000000000000");
  assert.equal(call.valueWei, "200000000000000000");
  assert.equal(call.days, 1);
  assert.deepEqual(JSON.parse(call.pagesJson), [PAGE]);
});

test("validateCreate reports each contract limit", () => {
  const { errors } = validateCreate({ name: "", domain: "x", pages: "", payout: "0", days: "0", bond: "0" });
  assert.deepEqual(Object.keys(errors).sort(), ["bond", "days", "domain", "name", "pages", "payout"]);
  const low = validateCreate({ name: "a", domain: "example.com", pages: "https://example.com/", payout: "0.2", days: "366", bond: "0.1" });
  assert.match(low.errors.bond ?? "", /at least the payout/);
  assert.match(low.errors.days ?? "", /365/);
  const six = validateCreate({
    name: "a",
    domain: "example.com",
    pages: Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`).join("\n"),
    payout: "0.1",
    days: "1",
    bond: "0.1",
  });
  assert.match(six.errors.pages ?? "", /1 to 5/);
});

test("validateChallenge accepts a good challenge from a non-brand account", () => {
  const { errors, call } = validateChallenge(goodChallenge, { pledge, challenges: [], account: OTHER, nowMs: DURING });
  assert.deepEqual(errors, {});
  assert.deepEqual(call, { args: [3, 0, "R1", goodChallenge.quote, "20261025130000"], valueWei: "10000000000000000" });
});

test("validateChallenge blocks what the contract refuses, and still encodes the call", () => {
  const ctx = { pledge, challenges: [], nowMs: DURING };
  const own = validateChallenge(goodChallenge, { ...ctx, account: BRAND.toLowerCase() });
  assert.match(own.errors.pledge ?? "", /brand cannot challenge/);
  assert.ok(own.call);

  const ended = validateChallenge(goodChallenge, { ...ctx, account: OTHER, nowMs: AFTER });
  assert.match(ended.errors.pledge ?? "", /ended/);

  const bad = validateChallenge(
    { pageIndex: 1, rule: "R4", quote: " short ", snapshotTs: "2026", stake: "0.001" },
    { ...ctx, account: OTHER },
  );
  assert.deepEqual(Object.keys(bad.errors).sort(), ["pageIndex", "quote", "rule", "snapshotTs", "stake"]);

  const future = validateChallenge({ ...goodChallenge, snapshotTs: "20261025190000" }, { ...ctx, account: OTHER });
  assert.match(future.errors.snapshotTs ?? "", /future/);
  const before = validateChallenge({ ...goodChallenge, snapshotTs: "20261025110000" }, { ...ctx, account: OTHER });
  assert.match(before.errors.snapshotTs ?? "", /after the pledge/);
});

test("validateChallenge warns about an already open challenge on the same page and rule", () => {
  const ctx = { pledge, account: OTHER, nowMs: DURING };
  assert.match(validateChallenge(goodChallenge, { ...ctx, challenges: [openChallenge()] }).errors.rule ?? "", /already open/);
  assert.deepEqual(validateChallenge(goodChallenge, { ...ctx, challenges: [openChallenge({ status: "REJECTED" })] }).errors, {});
  assert.deepEqual(validateChallenge(goodChallenge, { ...ctx, challenges: [openChallenge({ rule: "R2" })] }).errors, {});
});

test("validateChallenge blocks when the bond cannot reserve another payout", () => {
  const thin = { ...pledge, reserved: "200000000000000000" };
  assert.match(
    validateChallenge(goodChallenge, { pledge: thin, challenges: [], account: OTHER, nowMs: DURING }).errors.pledge ?? "",
    /cannot cover/,
  );
});

test("withdraw is offered to the brand only once coverage ended and something is available", () => {
  assert.equal(canWithdraw(pledge, BRAND, DURING), false);
  assert.equal(canWithdraw(pledge, BRAND, AFTER - 1), false);
  assert.equal(canWithdraw(pledge, BRAND, AFTER), true);
  assert.equal(canWithdraw(pledge, BRAND.toLowerCase(), AFTER), true);
  assert.equal(canWithdraw(pledge, OTHER, AFTER), false);
  assert.equal(canWithdraw(pledge, null, AFTER), false);
  assert.equal(canWithdraw({ ...pledge, available: 0 }, BRAND, AFTER), false);
  assert.equal(isBrand(pledge, BRAND.toUpperCase().replace("0X", "0x")), true);
});

test("resolve is offered until the deadline inclusive, expire only strictly after", () => {
  const c = openChallenge();
  const deadline = Date.parse(c.resolve_deadline);
  assert.equal(resolveWindow(c, deadline), "resolvable");
  assert.equal(resolveWindow(c, deadline + 999), "resolvable");
  assert.equal(resolveWindow(c, deadline + 1000), "expirable");
  assert.equal(resolveWindow({ ...c, status: "UPHELD" }, deadline + 1000), "settled");
});
