import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyReadError, decodeResultBase64, GreenClaimReadError, isWalletRejection, withTimeout } from "../lib/contracts/errors.ts";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/studio-receipts.json", import.meta.url), "utf8"));

test("decodes the base64 read error: status byte 0x01, then the contract message", () => {
  assert.deepEqual(decodeResultBase64("AVtFWFBFQ1RFRF0gdW5rbm93biBwbGVkZ2U="), { code: 1, text: "[EXPECTED] unknown pledge" });
  assert.equal(decodeResultBase64("not base64!"), null);
});

test("observed: reading get_pledge(99) is 'not found', not an RPC failure", () => {
  const observed = fixtures.read_error_unknown_pledge;
  assert.equal(observed.message, "Missing or invalid parameters.");
  const err = classifyReadError(observed);
  assert.equal(err.kind, "not_found");
  assert.equal(err.message, "[EXPECTED] unknown pledge");
  assert.equal(err.code, "EXPECTED");
});

function readError(message: string) {
  const bytes = new TextEncoder().encode(message);
  const result = btoa(String.fromCharCode(1, ...bytes));
  return { message: "Missing or invalid parameters.", cause: { code: -32000, message: "execution failed", data: { receipt: { execution_result: "ERROR", result } } } };
}

test("unknown challenge is 'not found'; other contract errors are 'contract'", () => {
  assert.equal(classifyReadError(readError("[EXPECTED] unknown challenge")).kind, "not_found");
  const other = classifyReadError(readError("[EXPECTED] invalid brand address"));
  assert.equal(other.kind, "contract");
  assert.equal(other.message, "[EXPECTED] invalid brand address");
});

test("a gateway HTML page or a network failure is an RPC error", () => {
  const html = classifyReadError(new Error(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`));
  assert.equal(html.kind, "rpc");
  assert.equal(classifyReadError(new TypeError("Failed to fetch")).kind, "rpc");
  assert.equal(classifyReadError("weird").kind, "rpc");
});

test("a read that never answers fails after the timeout, and a fast answer wins", async () => {
  const timeout = new GreenClaimReadError("rpc", "No answer from the contract after 20 seconds.", null, false);
  await assert.rejects(withTimeout(new Promise(() => undefined), 30, () => timeout), (err: unknown) => {
    assert.ok(err instanceof GreenClaimReadError);
    assert.equal(err.retryable, false);
    assert.equal(classifyReadError(err), err);
    return true;
  });
  assert.equal(await withTimeout(Promise.resolve("ok"), 30, () => timeout), "ok");
});

test("wallet refusal (EIP-1193 4001) is detected through the cause chain", () => {
  assert.equal(isWalletRejection({ code: 4001, message: "User rejected the request." }), true);
  assert.equal(isWalletRejection(new Error("send failed", { cause: { code: 4001 } })), true);
  assert.equal(isWalletRejection(new Error("User denied transaction signature")), true);
  assert.equal(isWalletRejection(new Error("insufficient funds")), false);
});
