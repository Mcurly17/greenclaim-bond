# Deploying GreenClaim Bond

Nothing here has been run yet. Each command below deploys or spends test GEN only when you run it.

Network values were re-checked on 23 October 2026, after the 22 October move of Bradbury to an Arbitrum Orbit chain:
- the [networks page](https://docs.genlayer.com/developers/networks);
- the presets in `genlayer@0.40.0-rc.5` and `genlayer-js@2.0.0-rc.2`;
- read-only JSON-RPC calls to both endpoints.

| | Studionet | Testnet Bradbury (Phase 2) |
|---|---|---|
| GenLayer RPC | `https://studio.genlayer.com/api` (live `eth_chainId` = `0xf22f`) | Phase 2 node RPC: **not published yet** (see below) |
| Chain RPC | (same) | `https://rpc.testnet-chain.genlayer.com` |
| Chain ID | 61999 | 4221 (live `eth_chainId` = `0x107d`) |
| Block 0 hash | n/a | `0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4` (matches live) |
| AddressManager | n/a | `0x3F71AE080BD6270A91dBcc7960d88797828538E0` (code present) |
| Explorer | [explorer-studio.genlayer.com](https://explorer-studio.genlayer.com) (docs); the SDK preset says `genlayer-explorer.vercel.app` | [scan.testnet-chain.genlayer.com](https://scan.testnet-chain.genlayer.com) |
| Funds | gasless; faucet button in Studio | [testnet-faucet.genlayer.foundation](https://testnet-faucet.genlayer.foundation): 100 GEN/week, needs 0.01 ETH on Ethereum mainnet |

Stale values, do not use: `rpc-bradbury.genlayer.com` and `explorer-bradbury.genlayer.com`. They are still the defaults in `genlayer@0.39.2` (`latest`), `genlayer-js@1.1.8`, `genlayer-py` and `genlayer-test`.

## 0. Before any deployment

```powershell
.\.venv\Scripts\activate
pytest tests/direct -v                              # 17 passed
$env:PYTHONIOENCODING = "utf-8"                     # Windows console only
genvm-lint check contracts/green_claim_bond.py      # must be 0 errors
npm install --workspaces=false                      # root genlayer-js 2.0.0-rc.2 for scripts/greenclaim.ts
npm install -g genlayer@rc                          # CLI 0.40.0-rc.5: the only line with Phase 2 presets
genlayer --version
```

### Key handling

- Never type a private key or password as a command argument: it stays in the shell history. Do not use `--password` or `--private-key`.
- `genlayer account create` and `genlayer account import` (without `--private-key`) prompt with hidden input.
- `scripts/greenclaim.ts` and `gltest` read keys from `.env` (gitignored). Paste them there with an editor; never `echo` them.
- Use throwaway wallets, never the main one. Fund them from the main wallet in the browser (step 2.3).

## 1. Studionet

### 1.1 Deploy

**Option A: Studio UI (the link the submission asks for)**
1. Open [studio.genlayer.com](https://studio.genlayer.com).
2. Load `contracts/green_claim_bond.py` in the contracts panel.
3. Deploy it; the constructor has no arguments.
4. Copy the address. The shareable link is `https://studio.genlayer.com/?import-contract=<address>`.

**Option B: CLI**
```powershell
genlayer network set studionet
genlayer account create --name gcb-studio           # prompts for a keystore password
genlayer deploy --contract contracts/green_claim_bond.py
```

### 1.2 Scenario

Read-only calls work from the CLI. Payable methods do not: `genlayer write` has no message-value option (`--fee-value` is the fee deposit), and `--args` turns `'[...]'` into a list, not a string. So `create_pledge`, `top_up` and `challenge` go through `npm run greenclaim`, which uses genlayer-js `writeContract({ value })`.

**Funding unverified.** Value transfers need a funded sender, even though Studionet is gasless. Use the faucet button in Studio's account selector. `sim_fundAccount`, used by the integration test, is officially localnet-only in the SDKs, so it may be refused on hosted Studionet.

**Option C: one-shot integration test.** It deploys its own instance:
```powershell
$env:GREENCLAIM_IT_PAGE  = "https://<brand domain>/<product page>"
$env:GREENCLAIM_IT_QUOTE = "<exact sentence copied from that page>"
gltest tests/integration/ -v -s --network studionet
```
It captures a fresh Wayback snapshot with Save Page Now, because snapshots older than the pledge are refused. Then it runs `challenge` and `resolve` and prints the final status and reason.

## 2. Testnet Bradbury (Phase 2)

### 2.1 Select and verify the network

```powershell
genlayer network set testnet-bradbury
genlayer network info      # expect chain 4221, rpc.testnet-chain.genlayer.com, AddressManager 0x3F71...38E0
```

Re-check the genesis yourself; the docs warn that an old RPC can answer with the right chain ID:
```powershell
$body = '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0",false]}'
(Invoke-RestMethod -Method Post -Uri https://rpc.testnet-chain.genlayer.com -ContentType application/json -Body $body).result.hash
# must print 0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4
```

### 2.2 Phase 2 node RPC (open point)

The docs say `gen_*` methods (`gen_call`, so every view and the receipt decoding) need "the Phase 2 node RPC published in the release announcement". The Conduit chain RPC above does not serve them, and no public URL is listed yet. Both RC presets still default to the chain RPC.

- `genlayer deploy` may work on the chain RPC alone, since it sends an EVM transaction to ConsensusMain.
- Reads will need the node RPC. Once it is published:
```powershell
genlayer network add bradbury-p2 --base testnet-bradbury --rpc <PHASE2_NODE_RPC> --explorer https://scan.testnet-chain.genlayer.com
genlayer network set bradbury-p2
# and in .env for the script: GENLAYER_RPC=<PHASE2_NODE_RPC>
```

### 2.3 Accounts and funds

1. **Create two throwaway accounts** in a browser wallet: brand and challenger.
   - Paste their private keys into `.env` as `ACCOUNT_PRIVATE_KEY_1` and `ACCOUNT_PRIVATE_KEY_2`, using an editor.
   - Import them into the CLI keystore at the hidden prompt:
     ```powershell
     genlayer account import --name gcb-brand            # prompts for the key, then a keystore password
     genlayer account import --name gcb-challenger
     genlayer account list
     ```
2. **Fund them** from your main wallet. Its private key never leaves the wallet.
   - Open [testnet-faucet.genlayer.foundation](https://testnet-faucet.genlayer.foundation). The address needs 0.01 ETH on Ethereum mainnet.
   - Claim 100 GEN.
   - Add the GenLayer Chain to the wallet with the table above, then send about 5 GEN to each `gcb-*` address.
3. **Check:** `genlayer account show --account gcb-brand`.

### 2.4 Deploy

```powershell
genlayer account use gcb-brand
genlayer deploy --contract contracts/green_claim_bond.py     # prompts for the keystore password
```
`genlayer deploy` with no `--contract` runs `deploy/deployScript.ts` instead, with the same contract and no constructor arguments.

Record the printed address and the deploy transaction hash. Then check them:
- `genlayer receipt <tx hash>`: execution must be `FINISHED_WITH_RETURN`, not just `ACCEPTED`;
- `genlayer code <address>`;
- `https://scan.testnet-chain.genlayer.com/tx/<tx hash>`.

Open point: which explorer shows a GenLayer contract (not just the EVM transaction) in Phase 2.

### 2.5 Five-step scenario (PowerShell, `.env` filled, `GENLAYER_NETWORK=testnet-bradbury`)

```powershell
# 1. Brand pledges 0.2 GEN, payout 0.1 GEN, 30 days, one page (GREENCLAIM_SIGNER=1).
$env:GREENCLAIM_SIGNER = "1"
npm run greenclaim -- pledge "Brand" brand.example 0.1 30 0.2 https://brand.example/product

# 2. Take a snapshot after the pledge: open https://web.archive.org/save and submit the page URL.
#    Note the 14-digit timestamp in the resulting /web/<timestamp>/ URL.

# 3. Challenger stakes 0.01 GEN (payout / 10) on one exact sentence.
$env:GREENCLAIM_SIGNER = "2"
npm run greenclaim -- challenge 0 0 R1 "Our eco-friendly bottle goes everywhere." 20261024120000 0.01

# 4. Anyone resolves within 3 days (retry on [TRANSIENT]; after the deadline use `expire`).
npm run greenclaim -- resolve 0
npm run greenclaim -- challenge-info 0

# 5. Read the outcome.
npm run greenclaim -- pledge-info 0
npm run greenclaim -- standing <brand address>
```

## 3. After deploying

Fill the README "Deployments" table:
- the Studio import link;
- the Bradbury address;
- explorer links for the deploy and resolve transactions.

The "Intelligent Contracts" submission needs the GitHub repo, the Bradbury explorer link and the Studio link.
