import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatUtc,
  formatWei,
  isoToSnapshot,
  parseGen,
  parseIsoUtc,
  shortAddress,
  snapshotToIso,
  toWei,
} from "../lib/format.ts";

test("toWei converts numbers and strings exactly", () => {
  assert.equal(toWei(0), 0n);
  assert.equal(toWei(10), 10n);
  assert.equal(toWei(Number.MAX_SAFE_INTEGER), 9007199254740991n);
  assert.equal(toWei("300000000000000000"), 300000000000000000n);
  assert.equal(toWei("210000000000000000"), 210000000000000000n);
  assert.equal(toWei(5n), 5n);
});

test("toWei keeps every digit above 2^53", () => {
  assert.equal(toWei("9007199254740993"), 9007199254740993n);
  assert.equal(toWei("123456789012345678901234567890"), 123456789012345678901234567890n);
});

test("toWei refuses values that are not exact non-negative integers", () => {
  for (const bad of [1.5, -1, Number.MAX_SAFE_INTEGER + 2, NaN, "1e18", "-1", "0x10", "", " 1", "1.0", null, undefined, {}]) {
    assert.throws(() => toWei(bad), `should refuse ${String(bad)}`);
  }
});

test("parseGen is strict and never goes through floats", () => {
  assert.equal(parseGen("0.3"), 300000000000000000n);
  assert.equal(parseGen("0.21"), 210000000000000000n);
  assert.equal(parseGen("1"), 10n ** 18n);
  assert.equal(parseGen(" 2 "), 2n * 10n ** 18n);
  assert.equal(parseGen("0.000000000000000001"), 1n);
  assert.equal(parseGen("123456789.123456789123456789"), 123456789123456789123456789n);
  for (const bad of ["", ".5", "1.", "1e18", "-1", "+1", "1,5", "0.0000000000000000001", "abc", "1 000"]) {
    assert.throws(() => parseGen(bad), `should refuse ${JSON.stringify(bad)}`);
  }
});

test("formatWei keeps every significant decimal", () => {
  assert.equal(formatWei("300000000000000000"), "0.3");
  assert.equal(formatWei("210000000000000000"), "0.21");
  assert.equal(formatWei(0), "0");
  assert.equal(formatWei(10), "0.00000000000000001");
  assert.equal(formatWei("1000000000000000000"), "1");
  assert.equal(formatWei("123456789123456789123456789"), "123456789.123456789123456789");
});

test("formatWei and parseGen round-trip", () => {
  for (const text of ["0.3", "0.01", "5", "0.000000000000000001", "42.5"]) {
    assert.equal(formatWei(parseGen(text)), text);
  }
});

test("dates: strict ISO UTC and 14-digit snapshots", () => {
  assert.equal(parseIsoUtc("2026-10-23T20:22:11Z")?.getTime(), Date.UTC(2026, 9, 23, 20, 22, 11));
  assert.equal(parseIsoUtc("2026-02-30T00:00:00Z"), null);
  assert.equal(parseIsoUtc("2026-10-23 20:22:11"), null);
  assert.equal(formatUtc("2026-10-23T20:22:11Z"), "2026-10-23 20:22:11 UTC");
  assert.equal(snapshotToIso("20261023202211"), "2026-10-23T20:22:11Z");
  assert.equal(snapshotToIso("20261332000000"), null);
  assert.equal(snapshotToIso("2026102320221"), null);
  assert.equal(isoToSnapshot("2026-10-23T20:20:56Z"), "20261023202056");
});

test("shortAddress", () => {
  assert.equal(shortAddress("0x1f55BBf41a944666B287a802CC98c118e14f0932"), "0x1f55…0932");
  assert.equal(shortAddress(""), "—");
});
