import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIMITS, RULE_TEXT, ruleTitle } from "../lib/rules.ts";
import { pledgeState, resolveWindow } from "../lib/status.ts";
import { parseAddressParam, parseIdParam } from "../lib/params.ts";

const source = readFileSync(new URL("../../contracts/green_claim_bond.py", import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** Concatenates the adjacent Python string literals of one RULE_TEXT entry. */
function pythonRule(rule: string): string {
  const block = source.slice(source.indexOf("RULE_TEXT = {"), source.indexOf("\n}\n", source.indexOf("RULE_TEXT = {")));
  const entry = new RegExp(`"${rule}": \\(([\\s\\S]*?)\\n    \\),?`).exec(block);
  assert.ok(entry, `RULE_TEXT entry ${rule} not found in the contract`);
  const literals = [...entry[1].matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)];
  return literals.map((m) => (m[1] ?? m[2]).replace(/\\(['"\\])/g, "$1")).join("");
}

test("RULE_TEXT is verbatim from the contract", () => {
  for (const rule of ["R1", "R2", "R3"] as const) {
    assert.equal(RULE_TEXT[rule], pythonRule(rule), rule);
  }
  assert.equal(ruleTitle("R1"), "Generic environmental claim without specification.");
});

test("limits match the contract constants", () => {
  for (const [name, value] of Object.entries(LIMITS)) {
    if (name === "RESOLVE_WINDOW_DAYS") {
      assert.match(source, new RegExp(`^RESOLVE_WINDOW = datetime\\.timedelta\\(days=${value}\\)$`, "m"));
    } else {
      assert.match(source, new RegExp(`^${name} = ${value}\\b`, "m"), name);
    }
  }
});

test("pledge state follows the contract checks", () => {
  const ends = Date.UTC(2026, 10, 22, 20, 22, 11);
  const p = { active: true, ends_at: "2026-11-22T20:22:11Z" };
  assert.equal(pledgeState(p, ends - 1000), "active");
  assert.equal(pledgeState(p, ends), "ended");
  assert.equal(pledgeState({ ...p, active: false }, ends - 1000), "withdrawn");
});

test("resolve until the deadline inclusive, expire strictly after", () => {
  const c = { status: "OPEN", resolve_deadline: "2026-10-26T20:22:11Z" };
  const deadline = Date.UTC(2026, 9, 26, 20, 22, 11);
  assert.equal(resolveWindow(c, deadline - 1), "resolvable");
  assert.equal(resolveWindow(c, deadline + 999), "resolvable");
  assert.equal(resolveWindow(c, deadline + 1000), "expirable");
  assert.equal(resolveWindow({ ...c, status: "UPHELD" }, deadline - 1), "settled");
});

test("query-string ids and addresses", () => {
  assert.equal(parseIdParam("0"), 0);
  assert.equal(parseIdParam("17"), 17);
  for (const bad of [null, "", "-1", "1.5", "1e3", "0x1", " 1", "abc", "9999999999999999"]) {
    assert.equal(parseIdParam(bad), null, String(bad));
  }
  assert.equal(parseAddressParam(" 0x1f55BBf41a944666B287a802CC98c118e14f0932 "), "0x1f55BBf41a944666B287a802CC98c118e14f0932");
  assert.equal(parseAddressParam("0x1234"), null);
  assert.equal(parseAddressParam(null), null);
});
