"use client";

import { Amount, ChallengePill, InternalLink, PledgePill, Time, useNow } from "@/components/bits";
import type { ChallengeView, PledgeView } from "@/lib/contracts/types";
import { pledgeState } from "@/lib/status";

export function PledgeTable({ pledges, empty }: { pledges: PledgeView[]; empty: string }) {
  const now = useNow();
  if (pledges.length === 0) return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="border-b border-white/10">
            <th className="py-2 pr-4">#</th>
            <th className="py-2 pr-4">Pledge</th>
            <th className="py-2 pr-4">Available bond</th>
            <th className="py-2 pr-4">Payout</th>
            <th className="py-2 pr-4">Coverage ends</th>
            <th className="py-2">State</th>
          </tr>
        </thead>
        <tbody>
          {pledges.map((p) => (
            <tr key={p.id} className="border-b border-white/5 align-top">
              <td className="py-3 pr-4 font-mono">{p.id}</td>
              <td className="py-3 pr-4">
                <InternalLink href={`/pledge/?id=${p.id}`}>{p.name}</InternalLink>
                <span className="block text-xs text-muted-foreground">{p.domain}</span>
              </td>
              <td className="py-3 pr-4">
                <Amount value={p.available} />
              </td>
              <td className="py-3 pr-4">
                <Amount value={p.payout} />
              </td>
              <td className="py-3 pr-4">
                <Time iso={p.ends_at} />
              </td>
              <td className="py-3">
                <PledgePill state={pledgeState(p, now)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChallengeTable({ challenges, empty, showPledge = true }: { challenges: ChallengeView[]; empty: string; showPledge?: boolean }) {
  if (challenges.length === 0) return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="border-b border-white/10">
            <th className="py-2 pr-4">#</th>
            {showPledge && <th className="py-2 pr-4">Pledge</th>}
            <th className="py-2 pr-4">Rule</th>
            <th className="py-2 pr-4">Quote</th>
            <th className="py-2 pr-4">Stake</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {challenges.map((c) => (
            <tr key={c.id} className="border-b border-white/5 align-top">
              <td className="py-3 pr-4 font-mono">
                <InternalLink href={`/challenge/?id=${c.id}`}>{c.id}</InternalLink>
              </td>
              {showPledge && (
                <td className="py-3 pr-4 font-mono">
                  <InternalLink href={`/pledge/?id=${c.pledge_id}`}>{c.pledge_id}</InternalLink>
                </td>
              )}
              <td className="py-3 pr-4 font-mono">{c.rule}</td>
              <td className="max-w-md py-3 pr-4">
                <InternalLink href={`/challenge/?id=${c.id}`}>“{c.quote}”</InternalLink>
              </td>
              <td className="py-3 pr-4">
                <Amount value={c.stake} />
              </td>
              <td className="py-3">
                <ChallengePill status={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
