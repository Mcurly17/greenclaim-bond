# GreenClaim Bond - frontend

Next.js shell kept from the GenLayer boilerplate (wallet connection, layout, UI kit).
The GreenClaim Bond screens (pledge registry, challenge form, decision history) are not written yet.

## Setup

```bash
npm install
cp .env.example .env
```

Environment variables:
- `NEXT_PUBLIC_GENLAYER_RPC_URL` - GenLayer RPC (default: https://studio.genlayer.com/api)
- `NEXT_PUBLIC_GENLAYER_CHAIN_ID`, `NEXT_PUBLIC_GENLAYER_CHAIN_NAME`, `NEXT_PUBLIC_GENLAYER_SYMBOL`
- `NEXT_PUBLIC_CONTRACT_ADDRESS` - deployed GreenClaimBond contract address

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech Stack

Next.js, TypeScript, Tailwind CSS v4, genlayer-js, TanStack Query, Radix UI / shadcn/ui.
