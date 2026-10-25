"use client";

import { useState } from "react";
import { Amount, Card, InternalLink, Pager } from "@/components/bits";
import { PledgeTable } from "@/components/lists";
import { QueryState } from "@/components/QueryState";
import { Shell } from "@/components/Shell";
import { usePledges, useStats } from "@/lib/contracts/greenClaim";

function Stats() {
  const stats = useStats();
  return (
    <QueryState query={stats} loadingLabel="Reading contract statistics…">
      {(s) => (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs uppercase text-muted-foreground">Pledges</p>
            <p className="mt-1 text-3xl font-semibold">{s.pledges}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase text-muted-foreground">Challenges</p>
            <p className="mt-1 text-3xl font-semibold">
              <InternalLink href="/challenges/">{s.challenges}</InternalLink>
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase text-muted-foreground">Stakes kept in bonds</p>
            <p className="mt-1 text-2xl font-semibold">
              <Amount value={s.pool} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">From rejected and quote-not-found challenges</p>
          </Card>
        </div>
      )}
    </QueryState>
  );
}

function Pledges() {
  const [page, setPage] = useState(0);
  const pledges = usePledges(page);
  return (
    <Card title="Pledges">
      <QueryState query={pledges} loadingLabel="Reading pledges…">
        {(result) => (
          <>
            <PledgeTable pledges={result.items} empty="No pledge yet." />
            <Pager page={page} pageCount={result.pageCount} onPage={setPage} />
          </>
        )}
      </QueryState>
    </Card>
  );
}

export default function HomePage() {
  return (
    <Shell>
      <div className="mb-8">
        <h1 className="mb-3 text-3xl font-bold md:text-4xl">GreenClaim Bond</h1>
        <p className="max-w-3xl text-muted-foreground">
          A brand lists product pages and locks a bond, pledging they contain no generic environmental claim, offset-based
          climate claim or unofficial sustainability label. Anyone can challenge one exact sentence on an archived
          snapshot; GenLayer validators re-read the snapshot and judge it against one{" "}
          <InternalLink href="/rules/">fixed rule</InternalLink>. An upheld challenge is paid from the bond.
        </p>
      </div>
      <div className="space-y-6">
        <Stats />
        <Pledges />
      </div>
    </Shell>
  );
}
