// Pure helpers: no app imports, so `node --test` can load this file directly.

export type ContractErrorCode = "EXPECTED" | "EXTERNAL" | "TRANSIENT" | "LLM_ERROR";

const PREFIX_RE = /\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]/;
const NOT_FOUND_RE = /\[EXPECTED\] unknown (pledge|challenge)\b/;
const GATEWAY_RE = /Unexpected token '<'|is not valid JSON|<!DOCTYPE|Failed to fetch|fetch failed|NetworkError/i;

/**
 * Decodes a GenVM result as Studio returns it in base64: one status byte
 * (0 = return, 1 = user error, ...) followed by the payload.
 */
export function decodeResultBase64(b64: string): { code: number; text: string } | null {
  try {
    const binary = atob(b64);
    if (binary.length === 0) return null;
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return { code: bytes[0], text: new TextDecoder().decode(bytes.subarray(1)) };
  } catch {
    return null;
  }
}

export function contractErrorCode(message: string | null | undefined): ContractErrorCode | null {
  const m = message ? PREFIX_RE.exec(message) : null;
  return m ? (m[1] as ContractErrorCode) : null;
}

/** Returns the contract's own message ("[EXPECTED] ...") from a longer text, or null. */
export function extractContractMessage(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = PREFIX_RE.exec(text);
  return m ? text.slice(m.index).trim() : null;
}

/**
 * Reads the error text of a GenVM result in any shape Studio uses:
 * a base64 string, or `{ status: "rollback", payload: "...", raw: "<base64>" }`.
 */
export function resultErrorText(result: unknown): string | null {
  if (typeof result === "string") {
    const decoded = decodeResultBase64(result);
    return decoded && decoded.code !== 0 ? decoded.text : null;
  }
  if (result && typeof result === "object") {
    const r = result as { status?: unknown; payload?: unknown; raw?: unknown };
    if (r.status === "return") return null;
    if (typeof r.payload === "string" && r.payload !== "") return r.payload;
    if (typeof r.raw === "string") {
      const decoded = decodeResultBase64(r.raw);
      if (decoded && decoded.code !== 0) return decoded.text;
    }
  }
  return null;
}

/**
 * Message shown when a write is blocked because the wallet is not on the expected chain.
 * Null when `currentHex` already matches, so nothing is sent and nothing is asked.
 */
export function wrongChainMessage(
  currentHex: string | null,
  expected: { chainIdHex: string; chainName: string; chainId: number },
): string | null {
  if (currentHex === expected.chainIdHex) return null;
  const current = currentHex !== null && /^0x[0-9a-f]+$/.test(currentHex) ? parseInt(currentHex, 16) : "unknown";
  return `Nothing was sent: your wallet is on chain ${current}. Switch it to ${expected.chainName} (chain ${expected.chainId}) and try again.`;
}

export type ReadErrorKind = "config" | "not_found" | "contract" | "rpc";

export class GreenClaimReadError extends Error {
  kind: ReadErrorKind;
  code: ContractErrorCode | null;
  /** False for a timeout: it already waited, so the Retry button decides, not an automatic retry. */
  retryable: boolean;

  constructor(kind: ReadErrorKind, message: string, code: ContractErrorCode | null = null, retryable = true) {
    super(message);
    this.name = "GreenClaimReadError";
    this.kind = kind;
    this.code = code;
    this.retryable = retryable;
  }
}

/** Rejects with `timeoutError()` when `promise` is still pending after `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, timeoutError: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function errorChain(err: unknown): Record<string, unknown>[] {
  const chain: Record<string, unknown>[] = [];
  let current: unknown = err;
  for (let depth = 0; current && typeof current === "object" && depth < 8; depth++) {
    chain.push(current as Record<string, unknown>);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

/**
 * Classifies a failed readContract. genlayer-js only says "execution failed";
 * the contract message sits in `cause.data.receipt.result` (base64).
 */
export function classifyReadError(err: unknown): GreenClaimReadError {
  if (err instanceof GreenClaimReadError) return err;
  const chain = errorChain(err);
  for (const node of chain) {
    const receipt = (node.data as { receipt?: { result?: unknown } } | undefined)?.receipt;
    const text = extractContractMessage(resultErrorText(receipt?.result));
    if (text) return contractReadError(text);
  }
  for (const node of chain) {
    for (const key of ["details", "shortMessage", "message"]) {
      const text = extractContractMessage(typeof node[key] === "string" ? (node[key] as string) : null);
      if (text) return contractReadError(text);
    }
  }
  const raw = chain
    .map((node) => (typeof node.message === "string" ? node.message : ""))
    .find((message) => message !== "");
  if (raw && GATEWAY_RE.test(raw)) {
    return new GreenClaimReadError("rpc", "The GenLayer RPC returned an error page or could not be reached. Try again.");
  }
  return new GreenClaimReadError("rpc", raw ? `The GenLayer RPC call failed: ${raw.split("\n")[0]}` : "The GenLayer RPC call failed.");
}

function contractReadError(text: string): GreenClaimReadError {
  const kind: ReadErrorKind = NOT_FOUND_RE.test(text) ? "not_found" : "contract";
  return new GreenClaimReadError(kind, text, contractErrorCode(text));
}

/** True when the user refused a wallet prompt (EIP-1193 code 4001). */
export function isWalletRejection(err: unknown): boolean {
  return errorChain(err).some(
    (node) =>
      node.code === 4001 ||
      (typeof node.message === "string" && /user (rejected|denied)/i.test(node.message)),
  );
}
