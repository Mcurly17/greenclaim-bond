"""Shared fixtures and helpers for GreenClaim Bond direct mode tests."""

import json
import os
import sys
import tempfile

import pytest

if sys.platform == "win32":
    # genlayer-test 0.29.2 unlinks the stdin temp file while fd 0 still holds it open,
    # which Windows refuses (WinError 32). Same logic, with a delete-on-close file instead.
    from gltest.direct import loader as _gltest_loader

    def _inject_message_to_fd0_windows(vm):
        from genlayer.py import calldata
        from genlayer.py.types import Address

        def _addr(a):
            return Address(a) if isinstance(a, bytes) else a

        encoded = calldata.encode({
            "contract_address": _addr(vm._contract_address),
            "sender_address": _addr(vm.sender),
            "origin_address": _addr(vm.origin),
            "stack": [],
            "value": vm._value,
            "datetime": vm._datetime,
            "is_init": False,
            "chain_id": vm._chain_id,
            "entry_kind": 0,
            "entry_data": b"",
            "entry_stage_data": None,
        })
        with tempfile.TemporaryFile() as tmp:
            tmp.write(encoded)
            tmp.flush()
            os.lseek(tmp.fileno(), 0, os.SEEK_SET)
            vm._original_stdin_fd = os.dup(0)
            os.dup2(tmp.fileno(), 0)

    _gltest_loader._inject_message_to_fd0 = _inject_message_to_fd0_windows

GEN = 10**18
CONTRACT = "contracts/green_claim_bond.py"

T0 = "2026-10-23T12:00:00Z"            # pledge creation
T_CHALLENGE = "2026-10-25T12:00:00Z"   # challenge filing
SNAPSHOT_TS = "20261024120000"         # between T0 and T_CHALLENGE

DOMAIN = "example-brand.fr"
PAGE = "https://example-brand.fr/gourde"
PAGES_JSON = json.dumps([PAGE, "https://www.example-brand.fr/sac"])

BOND = 10 * GEN
PAYOUT = 2 * GEN
STAKE = PAYOUT // 10

ARCHIVE_PATTERN = r".*web\.archive\.org.*"

QUOTE = "Notre gourde éco-responsable vous accompagne partout."

GENERIC_PAGE = (
    "<html><head><title>Gourde inox 750 ml</title>"
    "<script>var tracking = 'Notre gourde';</script><style>p{color:green}</style></head>"
    "<body><h1>Gourde inox 750 ml</h1>"
    "<p>Notre gourde\u00a0<b>éco-responsable</b> vous accompagne partout.</p>"
    "<p>Prix : 24,90 €</p></body></html>"
)

SPECIFIC_PAGE = (
    "<html><head><title>Gourde inox 750 ml</title></head><body>"
    "<p>Notre gourde éco-responsable vous accompagne partout.</p>"
    "<p>Fabriquée à 100 % en acier inoxydable recyclé, certifiée EU Ecolabel "
    "(licence FR/038/012).</p></body></html>"
)


def to_hex(addr):
    """Convert an address (bytes or Address) to checksummed hex matching view output.

    Call after direct_deploy so the SDK is on sys.path.
    """
    if hasattr(addr, "as_hex"):
        return addr.as_hex
    from genlayer.py.types import Address

    return Address(addr).as_hex


def verdict_json(violation, specification_present=False, reason="generic claim"):
    return json.dumps(
        {"violation": violation, "specification_present": specification_present, "reason": reason}
    )


def mock_snapshot(vm, body, status=200):
    vm.mock_web(ARCHIVE_PATTERN, {"method": "GET", "status": status, "body": body})


def mock_verdict(vm, violation, rule="R1", **kwargs):
    vm.mock_llm(rf".*Rule {rule}:.*", verdict_json(violation, **kwargs))


@pytest.fixture
def contract(direct_vm, direct_deploy):
    direct_vm.warp(T0)
    return direct_deploy(CONTRACT)


@pytest.fixture
def transfers(direct_vm):
    """Record value transfers emitted by the contract (EOA transfers are EthSend calls)."""
    sent = []

    def hook(vm, request):
        for op in ("EthSend", "PostMessage"):
            if op in request:
                data = request[op]
                sent.append((to_hex(data["address"]), int(data.get("value", 0))))
        return None

    direct_vm._gl_call_hook = hook
    return sent


@pytest.fixture
def prompts(direct_vm):
    """Capture every prompt sent to the mocked LLM (wraps a private VMContext method)."""
    captured = []
    original = direct_vm._match_llm_mock

    def capture(prompt):
        captured.append(prompt)
        return original(prompt)

    direct_vm._match_llm_mock = capture
    return captured


def make_pledge(vm, contract, brand, bond=BOND, payout=PAYOUT, days=30, pages_json=PAGES_JSON):
    vm.sender = brand
    vm.value = bond
    try:
        return contract.create_pledge("Example Brand", DOMAIN, pages_json, payout, days)
    finally:
        vm.value = 0


def open_challenge(
    vm, contract, challenger, pledge_id=0, page_index=0, rule="R1", quote=QUOTE,
    snapshot_ts=SNAPSHOT_TS, stake=STAKE,
):
    vm.warp(T_CHALLENGE)
    vm.sender = challenger
    vm.value = stake
    try:
        return contract.challenge(pledge_id, page_index, rule, quote, snapshot_ts)
    finally:
        vm.value = 0
