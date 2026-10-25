"use client";

import { ExternalLink } from "@/components/bits";
import { WritePreflightError, type WriteProgress, type WriteResult } from "@/lib/contracts/greenClaim";
import { CONFIG } from "@/lib/config";
import { formatGen } from "@/lib/format";
import { explorerTx, studioFaucet } from "@/lib/links";

const PHASE_TEXT: Record<WriteProgress["phase"], string> = {
  preparing: "Checking your wallet and network…",
  signing: "Confirm the transaction in your wallet…",
  sent: "Submitted. Waiting for validators…",
  consensus: "Submitted. Waiting for validators…",
};

function Box({ tone, children }: { tone: "info" | "ok" | "warn" | "error" | "muted"; children: React.ReactNode }) {
  const styles = {
    info: "border-sky-400/40 bg-sky-500/10",
    ok: "border-emerald-400/40 bg-emerald-500/10",
    warn: "border-amber-400/40 bg-amber-500/10",
    error: "border-red-400/40 bg-red-500/10",
    muted: "border-white/15 bg-white/5",
  }[tone];
  return (
    <div role="status" className={`mt-4 rounded-md border p-4 text-sm ${styles}`}>
      {children}
    </div>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <p className="mt-2 text-xs">
      Transaction <ExternalLink href={explorerTx(hash)} className="font-mono">{hash}</ExternalLink>
    </p>
  );
}

/**
 * Shows where a write stands and how it really ended. A success is shown only
 * when the receipt confirms it; `renderSuccess` adds what was re-read afterwards.
 */
export function TxStatus({
  isPending,
  progress,
  result,
  error,
  renderSuccess,
  onRetry,
}: {
  isPending: boolean;
  progress: WriteProgress | null;
  result: WriteResult | undefined;
  error: unknown;
  renderSuccess?: (result: WriteResult) => React.ReactNode;
  /** Offered after a consensus failure (or a [TRANSIENT] revert) while the call still makes sense. */
  onRetry?: () => void;
}) {
  if (isPending) {
    const hash = progress && "hash" in progress ? progress.hash : null;
    const status = progress?.phase === "consensus" ? progress.status : null;
    return (
      <Box tone="info">
        <p className="flex items-center gap-2">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
          {progress ? PHASE_TEXT[progress.phase] : PHASE_TEXT.preparing}
          {status && <span className="font-mono text-xs text-muted-foreground">({status})</span>}
        </p>
        {hash && <TxLink hash={hash} />}
      </Box>
    );
  }

  if (error) {
    if (error instanceof WritePreflightError && error.reason === "cancelled") {
      return <Box tone="muted">{error.message}</Box>;
    }
    return (
      <Box tone="error">
        <p>{error instanceof Error ? error.message : "The transaction could not be sent."}</p>
        {error instanceof WritePreflightError && error.reason === "insufficient_funds" && (
          <p className="mt-2">
            <ExternalLink href={studioFaucet()}>Open GenLayer Studio</ExternalLink>, select this account in the account
            menu and use its faucet button.
          </p>
        )}
      </Box>
    );
  }

  if (!result) return null;
  const { outcome, hash } = result;

  if (outcome.kind === "success") {
    return (
      <Box tone="ok">
        <p>
          Confirmed by validators <span className="font-mono text-xs text-muted-foreground">({outcome.status}, {outcome.consensus})</span>.
        </p>
        {renderSuccess?.(result)}
        <TxLink hash={hash} />
      </Box>
    );
  }

  if (outcome.kind === "failed") {
    const retryable = outcome.failure === "consensus" || outcome.errorCode === "TRANSIENT";
    return (
      <Box tone={outcome.failure === "consensus" ? "warn" : "error"}>
        {outcome.failure === "execution" && <p className="mb-1 text-xs uppercase text-muted-foreground">The contract refused the call</p>}
        <p className="break-words">{outcome.message}</p>
        {outcome.keptValue && (
          <p className="mt-2 text-xs">
            The {formatGen(outcome.keptValue, CONFIG.symbol)} sent with this call stayed in the contract balance: on this
            testnet the value is credited before the contract runs and is not refunded when the call fails. It is not added
            to any bond or to the challenger pool.
          </p>
        )}
        {retryable && onRetry && (
          <button onClick={onRetry} className="mt-3 rounded-md border border-white/20 px-4 py-1.5 hover:bg-white/5">
            Retry
          </button>
        )}
        <TxLink hash={hash} />
      </Box>
    );
  }

  return (
    <Box tone="warn">
      <p>{outcome.message}</p>
      <TxLink hash={hash} />
    </Box>
  );
}
