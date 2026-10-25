"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { TransactionHash } from "genlayer-js/types";
import { CONFIG } from "@/lib/config";
import { formatGen } from "@/lib/format";
import { mapLimit, pageCount, pageIds, PAGE_SIZE } from "@/lib/paging";
import {
  createGenLayerClient,
  getAccounts,
  getEthereumProvider,
  NO_WALLET_MESSAGE,
  switchToGenLayerNetwork,
} from "@/lib/genlayer/client";
import { classifyReadError, GreenClaimReadError, isWalletRejection, withTimeout, wrongChainMessage } from "./errors";
import { interpretReceipt, isDecidedStatus, receiptStatus, UNCONFIRMED_MESSAGE, type ReceiptOutcome } from "./receipt";
import type { ChallengeView, PledgeView, ReadMethod, Standing, Stats, WriteMethod } from "./types";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ROOT_KEY = "greenclaim";
/** Studionet allows about 60 requests per minute; list pages stay well below. */
const READ_CONCURRENCY = 3;
const ITEM_STALE_MS = 30_000;
/** A read that never answers must not leave the page on "Reading…" forever. */
const READ_TIMEOUT_MS = 20_000;

/** Read arguments are small ids and strings, so query keys never hold a bigint. */
export type ReadArg = string | number;

let readClient: ReturnType<typeof createGenLayerClient> | null = null;

function contract(): `0x${string}` {
  if (!CONFIG.contractAddress) throw new GreenClaimReadError("config", "No contract configured.");
  return CONFIG.contractAddress;
}

/** Calls a view on the configured RPC. No wallet is involved. */
export async function readGreenClaim<T>(functionName: ReadMethod, args: ReadArg[] = []): Promise<T> {
  const address = contract();
  readClient ??= createGenLayerClient();
  try {
    return (await withTimeout(
      readClient.readContract({ address, functionName, args, jsonSafeReturn: true }) as Promise<T>,
      READ_TIMEOUT_MS,
      () => new GreenClaimReadError("rpc", "No answer from the contract after 20 seconds.", null, false),
    )) as T;
  } catch (err) {
    throw classifyReadError(err);
  }
}

function key(functionName: ReadMethod | string, ...args: ReadArg[]): ReadArg[] {
  return [ROOT_KEY, CONFIG.contractAddress ?? "none", functionName, ...args];
}

/** Retries RPC failures only: "unknown pledge" or a business error will not change. */
function retryRpc(failureCount: number, err: unknown): boolean {
  return err instanceof GreenClaimReadError && err.kind === "rpc" && err.retryable && failureCount < 2;
}

function isId(id: number | null | undefined): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id >= 0;
}

function viewQuery<T>(functionName: ReadMethod, args: ReadArg[], enabled = true) {
  return {
    queryKey: key(functionName, ...args),
    queryFn: () => readGreenClaim<T>(functionName, args),
    enabled: enabled && CONFIG.contractAddress !== null,
    retry: retryRpc,
  };
}

function fetchPledge(queryClient: QueryClient, id: number): Promise<PledgeView> {
  return queryClient.fetchQuery({ ...viewQuery<PledgeView>("get_pledge", [id]), staleTime: ITEM_STALE_MS });
}

function fetchChallenge(queryClient: QueryClient, id: number): Promise<ChallengeView> {
  return queryClient.fetchQuery({ ...viewQuery<ChallengeView>("get_challenge", [id]), staleTime: ITEM_STALE_MS });
}

export function useStats() {
  return useQuery(viewQuery<Stats>("get_stats", []));
}

export function usePledge(id: number | null) {
  return useQuery(viewQuery<PledgeView>("get_pledge", [id ?? -1], isId(id)));
}

export function useChallenge(id: number | null) {
  return useQuery(viewQuery<ChallengeView>("get_challenge", [id ?? -1], isId(id)));
}

export function useChallenges(pledgeId: number | null) {
  return useQuery(viewQuery<ChallengeView[]>("list_challenges", [pledgeId ?? -1], isId(pledgeId)));
}

export function useStanding(brand: string | null) {
  const valid = brand !== null && ADDRESS_RE.test(brand);
  return useQuery(viewQuery<Standing>("standing", [brand ?? ""], valid));
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

function usePaged<T>(counter: "pledges" | "challenges", page: number, fetchOne: (qc: QueryClient, id: number) => Promise<T>) {
  const queryClient = useQueryClient();
  const stats = useStats();
  const total = stats.data?.[counter];
  const list = useQuery({
    queryKey: key(`${counter}-page`, total ?? -1, page, PAGE_SIZE),
    enabled: typeof total === "number",
    retry: retryRpc,
    queryFn: async (): Promise<Page<T>> => {
      const count = total ?? 0;
      const items = await mapLimit(pageIds(count, page), READ_CONCURRENCY, (id) => fetchOne(queryClient, id));
      return { items, total: count, page, pageCount: pageCount(count) };
    },
  });
  return withStats(list, stats);
}

/** A list depends on get_stats: surface its error and retry it, or the list waits forever. */
function withStats<L extends { error: unknown; refetch: () => unknown }>(list: L, stats: { error: unknown; refetch: () => unknown }) {
  if (!stats.error) return list;
  return { ...list, error: stats.error, refetch: stats.refetch };
}

/** Pledges, newest first, PAGE_SIZE per page. */
export function usePledges(page: number) {
  return usePaged<PledgeView>("pledges", page, fetchPledge);
}

/** All challenges, newest first, PAGE_SIZE per page. */
export function useAllChallenges(page: number) {
  return usePaged<ChallengeView>("challenges", page, fetchChallenge);
}

/**
 * Pledges of one brand. There is no list view, so every pledge is read once
 * (3 in flight, cached per id) and filtered here: O(n) in the number of pledges.
 */
export function useBrandPledges(brand: string | null) {
  const queryClient = useQueryClient();
  const stats = useStats();
  const total = stats.data?.pledges;
  const valid = brand !== null && ADDRESS_RE.test(brand);
  const list = useQuery({
    queryKey: key("brand-pledges", (brand ?? "").toLowerCase(), total ?? -1),
    enabled: valid && typeof total === "number",
    retry: retryRpc,
    queryFn: async () => {
      const ids = pageIds(total ?? 0, 0, total ?? 0);
      const pledges = await mapLimit(ids, READ_CONCURRENCY, (id) => fetchPledge(queryClient, id));
      return pledges.filter((p) => p.brand.toLowerCase() === (brand ?? "").toLowerCase());
    },
  });
  return withStats(list, stats);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** A wei amount kept as a decimal string until the call, so state stays JSON-safe. */
export interface WeiArg {
  wei: string;
}

export function wei(value: bigint | string): WeiArg {
  return { wei: value.toString() };
}

export type WriteArg = string | number | WeiArg;

export interface WriteInput {
  functionName: WriteMethod;
  args: WriteArg[];
  /** Message value in wei, as a decimal string. */
  valueWei?: string;
}

export type WriteProgress =
  | { phase: "preparing" }
  | { phase: "signing" }
  | { phase: "sent"; hash: string }
  | { phase: "consensus"; hash: string; status: string | null };

export interface WriteResult {
  hash: string;
  outcome: ReceiptOutcome;
}

export const CANCELLED_MESSAGE = "Cancelled in your wallet.";

/** Raised before anything is sent: no wallet, wrong chain, low balance, or a refusal. */
export class WritePreflightError extends Error {
  reason: "no_contract" | "no_wallet" | "no_account" | "wrong_chain" | "insufficient_funds" | "cancelled" | "send_failed";
  cause?: unknown;

  constructor(reason: WritePreflightError["reason"], message: string, cause?: unknown) {
    super(message);
    this.name = "WritePreflightError";
    this.reason = reason;
    this.cause = cause;
  }
}

function toCallArg(arg: WriteArg): string | number | bigint {
  return typeof arg === "object" ? BigInt(arg.wei) : arg;
}

async function walletChainId(): Promise<string | null> {
  const provider = getEthereumProvider();
  if (!provider) return null;
  const id = await provider.request({ method: "eth_chainId" });
  return typeof id === "string" ? id.toLowerCase() : null;
}

/**
 * genlayer-js 1.1.8 skips its own chain check on Studio networks, so a wallet
 * left on another chain would send there. Switch, then check again.
 */
async function ensureWalletChain(): Promise<void> {
  if ((await walletChainId()) === CONFIG.chainIdHex) return;
  let switchError: unknown = null;
  try {
    await switchToGenLayerNetwork();
  } catch (err) {
    switchError = err;
  }
  const blocked = wrongChainMessage(await walletChainId(), CONFIG);
  if (blocked) throw new WritePreflightError("wrong_chain", blocked, switchError);
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Polls the receipt of an already sent transaction. It only reads: a gateway
 * error or a not-yet-indexed hash is retried with backoff, never re-sent.
 */
export async function waitForOutcome(
  hash: string,
  onProgress?: (p: WriteProgress) => void,
  timeoutMs = 15 * 60_000,
): Promise<ReceiptOutcome> {
  readClient ??= createGenLayerClient();
  const deadline = Date.now() + timeoutMs;
  let delay = 3_000;
  while (Date.now() < deadline) {
    try {
      const tx = await readClient.getTransaction({ hash: hash as TransactionHash });
      const status = receiptStatus(tx);
      onProgress?.({ phase: "consensus", hash, status });
      if (isDecidedStatus(status)) return interpretReceipt(tx);
      delay = 3_000;
    } catch {
      delay = Math.min(delay * 2, 30_000);
    }
    await sleep(delay);
  }
  return {
    kind: "unconfirmed",
    failure: null,
    status: null,
    consensus: null,
    execution: null,
    message: `No final result after ${Math.round(timeoutMs / 60_000)} minutes. ${UNCONFIRMED_MESSAGE}`,
    errorCode: null,
    returnValue: undefined,
    keptValue: null,
  };
}

/**
 * Sends a write through the injected wallet, then waits for the real outcome.
 * Throws WritePreflightError only before a hash exists; afterwards it always
 * resolves with the interpreted receipt.
 */
export async function writeGreenClaim(input: WriteInput, onProgress?: (p: WriteProgress) => void): Promise<WriteResult> {
  if (!CONFIG.contractAddress) throw new WritePreflightError("no_contract", "No contract configured.");
  if (!getEthereumProvider()) {
    throw new WritePreflightError("no_wallet", NO_WALLET_MESSAGE);
  }
  const [account] = await getAccounts();
  if (!account) throw new WritePreflightError("no_account", "Connect your wallet first.");
  onProgress?.({ phase: "preparing" });

  await ensureWalletChain();

  const value = BigInt(input.valueWei ?? "0");
  const client = createGenLayerClient(account as `0x${string}`);
  if (value > 0n) {
    const balance = await client.getBalance({ address: account as `0x${string}` });
    if (balance < value) {
      throw new WritePreflightError(
        "insufficient_funds",
        `This call sends ${formatGen(value.toString(), CONFIG.symbol)} but the account holds ${formatGen(balance.toString(), CONFIG.symbol)}.`,
      );
    }
  }

  // Right before signing: the user may have switched networks in the meantime.
  await ensureWalletChain();
  onProgress?.({ phase: "signing" });
  let hash: string;
  try {
    hash = (await client.writeContract({
      address: CONFIG.contractAddress,
      functionName: input.functionName,
      args: input.args.map(toCallArg),
      value,
    })) as string;
  } catch (err) {
    if (isWalletRejection(err)) throw new WritePreflightError("cancelled", CANCELLED_MESSAGE, err);
    throw new WritePreflightError("send_failed", err instanceof Error ? err.message : "The wallet did not send the transaction.", err);
  }
  onProgress?.({ phase: "sent", hash });
  return { hash, outcome: await waitForOutcome(hash, onProgress) };
}

/** Sends one write at a time and refreshes every view only after a confirmed success. */
export function useWrite() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<WriteProgress | null>(null);
  const mutation = useMutation({
    mutationFn: (input: WriteInput) => writeGreenClaim(input, setProgress),
    onMutate: () => setProgress(null),
    onSuccess: async (result) => {
      if (result.outcome.kind === "success") {
        await queryClient.invalidateQueries({ queryKey: [ROOT_KEY] });
      }
    },
  });
  return { ...mutation, progress };
}
