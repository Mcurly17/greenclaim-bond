import { test } from "node:test";
import assert from "node:assert/strict";
import { mapLimit, pageCount, pageIds } from "../lib/paging.ts";
import { explorerTx, studioImport, waybackUrl } from "../lib/links.ts";

test("pageIds lists newest first and stops at id 0", () => {
  assert.deepEqual(pageIds(0, 0), []);
  assert.deepEqual(pageIds(1, 0), [0]);
  assert.deepEqual(pageIds(45, 0), Array.from({ length: 20 }, (_, i) => 44 - i));
  assert.deepEqual(pageIds(45, 2), [4, 3, 2, 1, 0]);
  assert.deepEqual(pageIds(45, 3), []);
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(45), 3);
});

test("mapLimit keeps order and never exceeds the limit", async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((done) => setTimeout(done, 5 * (8 - n)));
    inFlight--;
    return n * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60, 70]);
  assert.equal(peak, 3);
});

test("waybackUrl matches the contract's evidence URL", () => {
  assert.equal(
    waybackUrl("20261023202211", "https://mcurly17.github.io/greenclaim-bond/gourde-verte.html"),
    "https://web.archive.org/web/20261023202211id_/https://mcurly17.github.io/greenclaim-bond/gourde-verte.html",
  );
});

test("explorer and Studio links", () => {
  assert.equal(explorerTx("0xabc"), "https://explorer-studio.genlayer.com/tx/0xabc");
  assert.equal(
    studioImport("0x1f55BBf41a944666B287a802CC98c118e14f0932"),
    "https://studio.genlayer.com/?import-contract=0x1f55BBf41a944666B287a802CC98c118e14f0932",
  );
});
