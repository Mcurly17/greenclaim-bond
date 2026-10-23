"""End-to-end GreenClaim Bond flow on a real network with real web and LLM calls.

Run (deploys a new contract on the selected network):

    GREENCLAIM_IT_PAGE=https://brand.example/product \
    GREENCLAIM_IT_QUOTE="exact sentence copied from that page" \
    gltest tests/integration/ -v -s --network studionet

Optional: GREENCLAIM_IT_RULE (default R1), GREENCLAIM_IT_EXPECT (UPHELD,
REJECTED or QUOTE_NOT_FOUND). The test captures a fresh Wayback snapshot after
the pledge exists, because snapshots older than the pledge are refused.
"""

import os
import re
import time
from urllib.parse import urlsplit

import pytest
import requests
from gltest import get_contract_factory
from gltest.accounts import get_accounts
from gltest.assertions import tx_execution_succeeded
from gltest_cli.config.general import get_general_config

PAGE = os.environ.get("GREENCLAIM_IT_PAGE", "")
QUOTE = os.environ.get("GREENCLAIM_IT_QUOTE", "")
RULE = os.environ.get("GREENCLAIM_IT_RULE", "R1")
EXPECT = os.environ.get("GREENCLAIM_IT_EXPECT", "")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not (PAGE and QUOTE),
        reason="set GREENCLAIM_IT_PAGE and GREENCLAIM_IT_QUOTE to run (deploys a contract)",
    ),
]

PAYOUT = 10**17  # 0.1 GEN
BOND = 2 * PAYOUT
STAKE = PAYOUT // 10
FUNDING = 10**18
SETTLED = {"UPHELD", "REJECTED", "QUOTE_NOT_FOUND"}


def _domain(page: str) -> str:
    host = urlsplit(page).hostname or ""
    return host[4:] if host.startswith("www.") else host


def _fund_on_studio(addresses: list[str]) -> None:
    config = get_general_config()
    if not config.check_studio_based_rpc():
        return  # testnet accounts must be funded beforehand (faucet)
    for address in addresses:
        reply = requests.post(
            config.get_rpc_url(),
            json={"jsonrpc": "2.0", "id": 1, "method": "sim_fundAccount", "params": [address, FUNDING]},
            timeout=30,
        ).json()
        if "error" in reply:
            pytest.fail(f"sim_fundAccount refused for {address}: {reply['error']}")


def _capture_snapshot(page: str) -> str:
    """Ask Save Page Now for a fresh capture and return its 14-digit timestamp."""
    for attempt in range(3):
        response = requests.get(f"https://web.archive.org/save/{page}", timeout=180)
        location = response.headers.get("Content-Location", "") + " " + response.url
        match = re.search(r"/web/(\d{14})", location)
        if match:
            time.sleep(10)  # let the capture become readable through /web/
            return match.group(1)
        time.sleep(30 * (attempt + 1))
    pytest.fail(f"Save Page Now did not return a capture for {page}")


def test_pledge_challenge_resolve():
    brand, challenger = get_accounts()[:2]
    _fund_on_studio([brand.address, challenger.address])

    factory = get_contract_factory("GreenClaimBond")
    contract = factory.deploy(args=[], account=brand)
    as_brand = contract.connect(brand)
    as_challenger = contract.connect(challenger)

    receipt = as_brand.create_pledge(
        args=["Integration brand", _domain(PAGE), f'["{PAGE}"]', PAYOUT, 30]
    ).transact(value=BOND)
    assert tx_execution_succeeded(receipt)

    snapshot_ts = _capture_snapshot(PAGE)
    receipt = as_challenger.challenge(args=[0, 0, RULE, QUOTE, snapshot_ts]).transact(value=STAKE)
    assert tx_execution_succeeded(receipt)
    assert as_brand.get_pledge(args=[0]).call()["reserved"] == PAYOUT

    # A [TRANSIENT] archive error reverts resolve() and leaves the challenge OPEN.
    for attempt in range(3):
        receipt = as_challenger.resolve(args=[0]).transact()
        if tx_execution_succeeded(receipt):
            break
        time.sleep(60 * (attempt + 1))
    assert tx_execution_succeeded(receipt)

    challenge = as_brand.get_challenge(args=[0]).call()
    print(f"\nsnapshot {snapshot_ts}: {challenge['status']} ({challenge['reason']})")
    assert challenge["status"] in SETTLED
    if EXPECT:
        assert challenge["status"] == EXPECT

    pledge = as_brand.get_pledge(args=[0]).call()
    assert pledge["reserved"] == 0
    if challenge["status"] == "UPHELD":
        assert pledge["bond"] == BOND - PAYOUT
    else:
        assert pledge["bond"] == BOND + STAKE
