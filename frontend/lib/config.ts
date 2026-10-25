// The only module that reads environment variables. Next.js inlines each
// `process.env.NEXT_PUBLIC_*` at build time, so every access must stay literal.

export const BASE_PATH = "/greenclaim-bond";

const DEFAULTS = {
  rpcUrl: "https://studio.genlayer.com/api",
  chainId: 61999,
  chainName: "GenLayer Studio",
  symbol: "GEN",
};

export const EXPLORER_URL = "https://explorer-studio.genlayer.com";
export const STUDIO_URL = "https://studio.genlayer.com";
export const REPO_URL = "https://github.com/Mcurly17/greenclaim-bond";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function parseContractAddress(raw: string): `0x${string}` | null {
  return ADDRESS_RE.test(raw) ? (raw as `0x${string}`) : null;
}

function parseChainId(raw: string): number | null {
  if (raw === "") return DEFAULTS.chainId;
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseRpcUrl(raw: string): string | null {
  if (raw === "") return DEFAULTS.rpcUrl;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? raw : null;
  } catch {
    return null;
  }
}

const rawAddress = clean(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS);
const rawRpc = clean(process.env.NEXT_PUBLIC_GENLAYER_RPC_URL);
const rawChainId = clean(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID);

const contractAddress = parseContractAddress(rawAddress);
const rpcUrl = parseRpcUrl(rawRpc);
const chainId = parseChainId(rawChainId);

/** Human-readable configuration problems, shown in a notice instead of crashing. */
export const CONFIG_ISSUES: string[] = [
  ...(contractAddress
    ? []
    : [
        rawAddress === ""
          ? "No contract configured: NEXT_PUBLIC_CONTRACT_ADDRESS is empty."
          : "No contract configured: NEXT_PUBLIC_CONTRACT_ADDRESS is not a 0x-prefixed 40-hex-digit address.",
      ]),
  ...(rpcUrl ? [] : ["NEXT_PUBLIC_GENLAYER_RPC_URL is not a valid http(s) URL; the Studionet default is used."]),
  ...(chainId ? [] : ["NEXT_PUBLIC_GENLAYER_CHAIN_ID is not a positive integer; 61999 (Studionet) is used."]),
];

const resolvedChainId = chainId ?? DEFAULTS.chainId;

export const CONFIG = {
  contractAddress,
  rpcUrl: rpcUrl ?? DEFAULTS.rpcUrl,
  chainId: resolvedChainId,
  /** Lowercase hex, as wallets compare `eth_chainId` strings. */
  chainIdHex: `0x${resolvedChainId.toString(16)}`,
  chainName: clean(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_NAME) || DEFAULTS.chainName,
  symbol: clean(process.env.NEXT_PUBLIC_GENLAYER_SYMBOL) || DEFAULTS.symbol,
  explorerUrl: EXPLORER_URL,
} as const;

/** Prefixes a path served from `public/` with the export base path. */
export function asset(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
