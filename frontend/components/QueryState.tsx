"use client";

import { CONFIG } from "@/lib/config";
import { GreenClaimReadError } from "@/lib/contracts/errors";

export function Loading({ label = "Loading from the contract…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      {label}
    </div>
  );
}

export function MissingContract() {
  return (
    <div role="alert" className="brand-card border-red-400/40 p-6">
      <h2 className="mb-2 text-lg font-semibold">No contract configured</h2>
      <p className="text-sm text-muted-foreground">
        This build has no valid NEXT_PUBLIC_CONTRACT_ADDRESS, so nothing can be read. Set it in{" "}
        <code>frontend/.env.local</code> (see <code>frontend/.env.example</code>) or in the repository variables used by
        the Pages workflow, then rebuild.
      </p>
    </div>
  );
}

export function NotFound({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div role="alert" className="brand-card p-6">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export function ReadFailure({ error, onRetry, retrying = false }: { error: unknown; onRetry: () => void; retrying?: boolean }) {
  const message =
    error instanceof GreenClaimReadError || error instanceof Error ? error.message : "The read failed for an unknown reason.";
  const isRpc = !(error instanceof GreenClaimReadError) || error.kind === "rpc";
  return (
    <div role="alert" className="brand-card border-red-400/40 p-6">
      <h2 className="mb-2 text-lg font-semibold">{isRpc ? "Could not reach the contract" : "The contract refused the read"}</h2>
      <p className="mb-4 break-words text-sm text-muted-foreground">{message}</p>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="rounded-md border border-white/20 px-4 py-1.5 text-sm hover:bg-white/5 disabled:opacity-50"
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

interface QueryLike<T> {
  data: T | undefined;
  error: unknown;
  isPending: boolean;
  isFetching?: boolean;
  refetch: () => unknown;
}

/**
 * Renders the four states every read can be in: no contract, loading,
 * not found / failed (with Retry), or data.
 */
export function QueryState<T>({
  query,
  notFound,
  loadingLabel,
  children,
}: {
  query: QueryLike<T>;
  notFound?: React.ReactNode;
  loadingLabel?: string;
  children: (data: T) => React.ReactNode;
}) {
  if (!CONFIG.contractAddress) return <MissingContract />;
  if (query.error) {
    if (notFound && query.error instanceof GreenClaimReadError && query.error.kind === "not_found") return <>{notFound}</>;
    return <ReadFailure error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (query.isPending || query.data === undefined) return <Loading label={loadingLabel} />;
  return <>{children(query.data)}</>;
}
