import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interpretReceipt, isDecidedStatus, NO_CONSENSUS_MESSAGE, receiptStatus } from "../lib/contracts/receipt.ts";

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
  assert.equal(out.keptValue, null, "a successful call's value is the bond, not a loss");
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

test("observed: CANCELED + NO_MAJORITY + ERROR is a consensus failure, not a contract refusal", () => {
  const out = interpretReceipt(receipts.canceled_no_majority_llm_error);
  assert.equal(out.kind, "failed");
  assert.equal(out.failure, "consensus");
  assert.equal(out.errorCode, "LLM_ERROR");
  assert.equal(out.message, NO_CONSENSUS_MESSAGE);
});

test("observed: leader SUCCESS without consensus (CANCELED + NO_MAJORITY) is a failure", () => {
  const out = interpretReceipt(receipts.canceled_no_majority_leader_success);
  assert.equal(out.execution, "SUCCESS");
  assert.equal(out.kind, "failed");
  assert.equal(out.failure, "consensus");
  assert.equal(out.message, NO_CONSENSUS_MESSAGE);
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

test("observed: the brand challenging its own pledge is a contract refusal with the [EXPECTED] message as-is", () => {
  const receipt = receipts.failed_expected_brand_self_challenge as any;
  const out = interpretReceipt(receipt);
  assert.equal(out.kind, "failed");
  assert.equal(out.failure, "execution");
  assert.equal(out.status, "FINALIZED");
  assert.equal(out.consensus, "MAJORITY_AGREE");
  assert.equal(out.execution, "ERROR");
  assert.equal(out.errorCode, "EXPECTED");
  assert.equal(out.message, "[EXPECTED] the brand cannot challenge its own pledge");
  assert.notEqual(out.message, NO_CONSENSUS_MESSAGE);
  // Observed: the 0.01 GEN stake was credited to the contract and not refunded.
  assert.equal(out.keptValue, "10000000000000000");
  assert.equal(interpretReceipt({ ...receipt, value_credited: false }).keptValue, null);

  // Same receipt without the decoded payload: the raw base64 (0x01 + message) is enough.
  const leader = receipt.consensus_data.leader_receipt[0];
  const rawOnly = structuredClone(receipt);
  rawOnly.consensus_data.leader_receipt[0].result = { status: leader.result.status, raw: leader.result.raw };
  assert.equal(interpretReceipt(rawOnly).message, out.message);
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
  assert.equal(out.message, NO_CONSENSUS_MESSAGE);
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
