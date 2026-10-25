import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interpretReceipt, isDecidedStatus, receiptStatus } from "../lib/contracts/receipt.ts";

// Real Studionet receipts (genlayer-js 1.1.8), heavy fields removed. See _source in the file.
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/studio-receipts.json", import.meta.url), "utf8"));
const receipts = fixtures.receipts as Record<string, unknown>;

test("observed: create_pledge FINALIZED + MAJORITY_AGREE + SUCCESS is a success with the new id", () => {
  const out = interpretReceipt(receipts.success_create_pledge);
  assert.equal(out.kind, "success");
  assert.equal(out.status, "FINALIZED");
  assert.equal(out.consensus, "MAJORITY_AGREE");
  assert.equal(out.execution, "SUCCESS");
  assert.equal(out.returnValue, 0);
  assert.equal(out.message, null);
});

test("observed: the same receipt from waitForTransactionReceipt (snake_case) is a success too", () => {
  const out = interpretReceipt(receipts.success_create_pledge_simplified);
  assert.equal(out.kind, "success");
  assert.equal(out.status, "FINALIZED");
  assert.equal(out.returnValue, 0);
});

test("observed: resolve success decodes the returned status", () => {
  const out = interpretReceipt(receipts.success_resolve_rejected);
  assert.equal(out.kind, "success");
  assert.equal(out.returnValue, "REJECTED");
});

test("observed: CANCELED + NO_MAJORITY + ERROR is a failure carrying the contract message", () => {
  const out = interpretReceipt(receipts.canceled_no_majority_llm_error);
  assert.equal(out.kind, "failed");
  assert.equal(out.failure, "consensus");
  assert.equal(out.errorCode, "LLM_ERROR");
  assert.match(out.message ?? "", /\[LLM_ERROR\] invalid source classification/);
});

test("observed: leader SUCCESS without consensus (CANCELED + NO_MAJORITY) is a failure", () => {
  const out = interpretReceipt(receipts.canceled_no_majority_leader_success);
  assert.equal(out.execution, "SUCCESS");
  assert.equal(out.kind, "failed");
  assert.equal(out.failure, "consensus");
  assert.match(out.message ?? "", /NO_MAJORITY/);
});

test("observed: FINALIZED + NO_MAJORITY without a leader receipt is a failure", () => {
  const out = interpretReceipt(receipts.finalized_no_majority_no_leader);
  assert.equal(out.status, "FINALIZED");
  assert.equal(out.execution, null);
  assert.equal(out.kind, "failed");
  assert.equal(out.failure, "consensus");
});

test("camelCase receipt with FINISHED_WITH_RETURN is a success", () => {
  const out = interpretReceipt({ statusName: "ACCEPTED", resultName: "MAJORITY_AGREE", txExecutionResultName: "FINISHED_WITH_RETURN" });
  assert.equal(out.kind, "success");
});

test("camelCase receipt with FINISHED_WITH_ERROR is a failure", () => {
  const out = interpretReceipt({ statusName: "ACCEPTED", resultName: "MAJORITY_AGREE", txExecutionResultName: "FINISHED_WITH_ERROR" });
  assert.equal(out.kind, "failed");
  assert.equal(out.failure, "execution");
});

test("agreed contract error surfaces the [EXPECTED] message (payload, then raw base64)", () => {
  const message = "[EXPECTED] the brand cannot challenge its own pledge";
  const withPayload = interpretReceipt({
    statusName: "FINALIZED",
    result_name: "MAJORITY_AGREE",
    consensus_data: { leader_receipt: [{ execution_result: "ERROR", result: { status: "rollback", payload: message } }] },
  });
  assert.equal(withPayload.kind, "failed");
  assert.equal(withPayload.failure, "execution");
  assert.equal(withPayload.message, message);
  assert.equal(withPayload.errorCode, "EXPECTED");

  const raw = btoa(String.fromCharCode(1) + String.fromCharCode(...new TextEncoder().encode(message)));
  const withRaw = interpretReceipt({
    status_name: "ACCEPTED",
    result_name: "MAJORITY_AGREE",
    consensus_data: { leader_receipt: [{ execution_result: "ERROR", result: { status: "rollback", raw } }] },
  });
  assert.equal(withRaw.message, message);
});

test("[TRANSIENT] revert keeps its code so the UI can say the challenge stays open", () => {
  const out = interpretReceipt({
    statusName: "ACCEPTED",
    result_name: "MAJORITY_AGREE",
    consensus_data: { leader_receipt: [{ execution_result: "ERROR", result: { status: "rollback", payload: "[TRANSIENT] archive unavailable (503)" } }] },
  });
  assert.equal(out.kind, "failed");
  assert.equal(out.errorCode, "TRANSIENT");
});

test("UNDETERMINED is never a success, even with a SUCCESS leader", () => {
  const out = interpretReceipt({
    statusName: "UNDETERMINED",
    result_name: "MAJORITY_AGREE",
    consensus_data: { leader_receipt: [{ execution_result: "SUCCESS", result: { status: "return", payload: { readable: "1" } } }] },
  });
  assert.equal(out.kind, "failed");
  assert.equal(out.failure, "consensus");
});

test("MAJORITY_DISAGREE is a failure", () => {
  assert.equal(interpretReceipt({ statusName: "FINALIZED", result_name: "MAJORITY_DISAGREE" }).kind, "failed");
});

test("unknown or incomplete receipts are unconfirmed, never a success", () => {
  for (const receipt of [
    null,
    undefined,
    {},
    "0xabc",
    { statusName: "FINALIZED" },
    { statusName: "FINALIZED", result_name: "MAJORITY_AGREE" },
    { result_name: "MAJORITY_AGREE", consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] } },
    { statusName: "FINALIZED", consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] } },
    { statusName: "SOMETHING_NEW", result_name: "MAJORITY_AGREE", txExecutionResultName: "FINISHED_WITH_RETURN" },
  ]) {
    assert.equal(interpretReceipt(receipt).kind, "unconfirmed", JSON.stringify(receipt));
  }
});

test("a receipt still in progress is unconfirmed and polling continues", () => {
  const out = interpretReceipt({ statusName: "PROPOSING" });
  assert.equal(out.kind, "unconfirmed");
  assert.equal(isDecidedStatus(receiptStatus({ statusName: "PROPOSING" })), false);
  for (const status of ["ACCEPTED", "FINALIZED", "CANCELED", "UNDETERMINED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]) {
    assert.equal(isDecidedStatus(status), true, status);
  }
});
