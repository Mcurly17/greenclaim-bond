"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONFIG } from "@/lib/config";
import type { ChallengeStatus } from "@/lib/contracts/types";
import { formatDuration, formatGen, formatLocal, formatUtc, parseIsoUtc, shortAddress } from "@/lib/format";
import { explorerAddress } from "@/lib/links";
import { challengeLabel, PLEDGE_LABEL, type PledgeState } from "@/lib/status";

export function ExternalLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`text-accent underline-offset-2 hover:underline break-all ${className}`}>
      {children}
    </a>
  );
}

export function InternalLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`text-accent underline-offset-2 hover:underline ${className}`}>
      {children}
    </Link>
  );
}

/** Re-renders every `intervalMs` so countdowns and states stay current. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function Amount({ value }: { value: unknown }) {
  let text: string;
  try {
    text = formatGen(value, CONFIG.symbol);
  } catch {
    text = `${String(value)} (unreadable amount)`;
  }
  return <span className="font-mono tabular-nums">{text}</span>;
}

/** UTC time with the viewer's local time underneath. */
export function Time({ iso, relative = false }: { iso: string; relative?: boolean }) {
  const now = useNow();
  if (!iso) return <span className="text-muted-foreground">—</span>;
  const date = parseIsoUtc(iso);
  const diff = date ? date.getTime() - now : 0;
  return (
    <span>
      <span className="font-mono">{formatUtc(iso)}</span>
      {date && (
        <span className="block text-xs text-muted-foreground">
          {formatLocal(iso)}
          {relative && (diff > 0 ? ` · in ${formatDuration(diff)}` : ` · ${formatDuration(-diff)} ago`)}
        </span>
      )}
    </span>
  );
}

export function Address({ value, brandLink = false }: { value: string; brandLink?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      {brandLink ? (
        <InternalLink href={`/brand/?address=${value}`} className="font-mono">
          <span title={value}>{shortAddress(value)}</span>
        </InternalLink>
      ) : (
        <span className="font-mono" title={value}>
          {shortAddress(value)}
        </span>
      )}
      <ExternalLink href={explorerAddress(value)} className="text-xs">
        explorer
      </ExternalLink>
    </span>
  );
}

const CHALLENGE_PILL: Record<ChallengeStatus, string> = {
  OPEN: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  UPHELD: "border-orange-400/40 bg-orange-500/10 text-orange-200",
  REJECTED: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  QUOTE_NOT_FOUND: "border-slate-400/40 bg-slate-500/10 text-slate-200",
  EXPIRED: "border-zinc-400/40 bg-zinc-500/10 text-zinc-300",
};

const PLEDGE_PILL: Record<PledgeState, string> = {
  active: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  ended: "border-zinc-400/40 bg-zinc-500/10 text-zinc-300",
  withdrawn: "border-zinc-400/40 bg-zinc-500/10 text-zinc-300",
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

export function ChallengePill({ status }: { status: string }) {
  const style = CHALLENGE_PILL[status as ChallengeStatus] ?? CHALLENGE_PILL.EXPIRED;
  return <Pill className={style}>{challengeLabel(status)}</Pill>;
}

export function PledgePill({ state }: { state: PledgeState }) {
  return <Pill className={PLEDGE_PILL[state]}>{PLEDGE_LABEL[state]}</Pill>;
}

export function Card({ title, children, className = "" }: { title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`brand-card p-5 md:p-6 ${className}`}>
      {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

/** Label / value rows. */
export function Facts({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[12rem_1fr]">
      {rows.map(([label, value], i) => (
        <div key={i} className="contents">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="min-w-0 text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-3 text-sm">
      <button className="rounded border border-white/15 px-3 py-1 disabled:opacity-40" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        Newer
      </button>
      <span className="text-muted-foreground">
        Page {page + 1} of {pageCount}
      </span>
      <button
        className="rounded border border-white/15 px-3 py-1 disabled:opacity-40"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
      >
        Older
      </button>
    </div>
  );
}
