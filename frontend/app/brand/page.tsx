"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, ExternalLink, Facts } from "@/components/bits";
import { PledgeTable } from "@/components/lists";
import { Loading, NotFound, QueryState } from "@/components/QueryState";
import { Shell } from "@/components/Shell";
import { useBrandPledges, useStanding } from "@/lib/contracts/greenClaim";
import { explorerAddress } from "@/lib/links";
import { parseAddressParam } from "@/lib/params";

function BrandContent() {
  const address = parseAddressParam(useSearchParams().get("address"));
  const standing = useStanding(address);
  const pledges = useBrandPledges(address);
  if (address === null) {
    return (
      <NotFound title="Invalid brand address">
        <p>
          The address must end with <code>?address=</code> and a 0x-prefixed, 40-hex-digit account address. Brand
          addresses are linked from each pledge page.
        </p>
      </NotFound>
    );
  }
  return (
    <>
      <h1 className="mb-2 text-3xl font-bold">Brand</h1>
      <p className="mb-6 font-mono text-sm break-all">
        {address} <ExternalLink href={explorerAddress(address)} className="ml-2 font-sans text-xs">explorer</ExternalLink>
      </p>
      <div className="space-y-6">
        <Card title="Standing">
          <QueryState query={standing} loadingLabel="Reading standing…">
            {(s) => (
              <>
                <Facts
                  rows={[
                    ["Challenges upheld", <span key="u" className="text-xl font-semibold">{s.upheld}</span>],
                    ["Challenges rejected", <span key="r" className="text-xl font-semibold">{s.rejected}</span>],
                  ]}
                />
                <p className="mt-4 text-xs text-muted-foreground">
                  Counts judged challenges across all pledges of this address. Open, quote-not-found and expired
                  challenges are not counted.
                </p>
              </>
            )}
          </QueryState>
        </Card>
        <Card title="Pledges by this brand">
          <QueryState query={pledges} loadingLabel="Reading pledges (3 at a time)…">
            {(list) => <PledgeTable pledges={list} empty="This address has no pledge." />}
          </QueryState>
        </Card>
      </div>
    </>
  );
}

export default function BrandPage() {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <BrandContent />
      </Suspense>
    </Shell>
  );
}
