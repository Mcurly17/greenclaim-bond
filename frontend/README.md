# GreenClaim Bond frontend

Static dApp for the [GreenClaim Bond](../README.md) contract. It reads pledges and challenges from the public RPC and sends `create_pledge`, `top_up`, `challenge`, `resolve`, `expire` and `withdraw` through the visitor's injected wallet (`window.ethereum`). Any wallet that supports custom EVM networks works. The frontend never sees a key, and it shows a success only when the validators' receipt confirms one.

The export is served under `/greenclaim-bond/`, which is the GitHub Pages path of this repository: [mcurly17.github.io/greenclaim-bond](https://mcurly17.github.io/greenclaim-bond/).

## Pages

| Page | What it shows |
|---|---|
| `/` | Pledge count, pool, and the pledges, newest first |
| `/pledge/?id=` | One pledge, its pages, its challenges, and the actions the visitor can sign |
| `/challenges/` | Every challenge, newest first |
| `/challenge/?id=` | One challenge, the rule, the Wayback capture, and resolve or expire |
| `/brand/?address=` | One brand's standing and pledges |
| `/rules/` | Rules R1, R2 and R3, verbatim from the contract |
| `/create/` | The pledge form |

A missing id, an unknown id, an RPC failure and a missing contract address each have their own state. The RPC failure offers a Retry button. A read that does not answer within 20 seconds becomes that failure instead of spinning.

## Setup

```powershell
cd frontend
copy .env.example .env.local
npm install
```

`.env.local` is gitignored. Every value in it is public:

- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_GENLAYER_RPC_URL` (Studionet: `https://studio.genlayer.com/api`)
- `NEXT_PUBLIC_GENLAYER_CHAIN_ID` (`61999`), `NEXT_PUBLIC_GENLAYER_CHAIN_NAME`, `NEXT_PUBLIC_GENLAYER_SYMBOL`

## Scripts

```powershell
npm run dev      # http://localhost:3000/greenclaim-bond/
npm run lint     # tsc --noEmit
npm test         # node --test, Node 22
npm run build    # static export in out/, then scripts/check-export.mjs
```

From the repository root the same scripts are `npm run dev`, `npm run lint`, `npm run test:frontend` and `npm run build`.

Adding `?checks=off` to a page shows every action and skips the client-side checks, so a deliberate contract refusal can be signed. It is active only while `NODE_ENV` is `development`. The exported site drops it, and `scripts/check-export.mjs` fails the build if any of that code remains in `out/`.

## Stack

Next.js 16 (static export), TypeScript, Tailwind CSS 4, genlayer-js 1.1.8, TanStack Query, Radix UI.
