"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Address, Amount, Card, ExternalLink, Facts, InternalLink, PledgePill, Time, useNow } from "@/components/bits";
import { ChallengeTable } from "@/components/lists";
import { Loading, NotFound, QueryState } from "@/components/QueryState";
import { Shell } from "@/components/Shell";
import { useChallenges, usePledge } from "@/lib/contracts/greenClaim";
import type { PledgeView } from "@/lib/contracts/types";
import { savePageNow, waybackCalendar } from "@/lib/links";
import { parseIdParam } from "@/lib/params";
import { pledgeState } from "@/lib/status";

function PledgeDetails({ pledge }: { pledge: PledgeView }) {
  const now = useNow();
  const state = pledgeState(pledge, now);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{pledge.name}</h1>
        <PledgePill state={state} />
      </div>
      <div className="space-y-6">
        <Card title="Bond">
          <Facts
            rows={[
              ["Brand", <Address key="b" value={pledge.brand} brandLink />],
              ["Domain", <span key="d" className="font-mono">{pledge.domain}</span>],
              ["Bond", <Amount key="bond" value={pledge.bond} />],
              ["Reserved for open challenges", <Amount key="r" value={pledge.reserved} />],
              ["Available", <Amount key="a" value={pledge.available} />],
              ["Payout per upheld challenge", <Amount key="p" value={pledge.payout} />],
              ["Minimum stake to challenge", <Amount key="m" value={pledge.min_stake} />],
              ["Created", <Time key="c" iso={pledge.created_at} />],
              ["Coverage ends", <Time key="e" iso={pledge.ends_at} relative />],
            ]}
          />
          {state !== "active" && (
            <p className="mt-4 text-sm text-muted-foreground">
              {state === "ended"
                ? "Coverage has ended: the contract no longer accepts challenges on this pledge."
                : "The brand withdrew the available bond: the contract no longer accepts challenges on this pledge."}
            </p>
          )}
        </Card>

        <Card title={`Covered pages (${pledge.pages.length})`}>
          <ol className="space-y-4">
            {pledge.pages.map((url, index) => (
              <li key={index} className="text-sm">
                <span className="mr-2 font-mono text-muted-foreground">#{index}</span>
                <ExternalLink href={url}>{url}</ExternalLink>
                <span className="mt-1 flex flex-wrap gap-x-4 text-xs">
                  <ExternalLink href={waybackCalendar(url)}>Wayback captures</ExternalLink>
                  <ExternalLink href={savePageNow(url)}>Request a new capture</ExternalLink>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">
            A challenge is judged on one Wayback Machine capture taken between the pledge creation and the filing of the
            challenge.
          </p>
        </Card>

        <PledgeChallenges pledgeId={pledge.id} />
      </div>
    </>
  );
}

function PledgeChallenges({ pledgeId }: { pledgeId: number }) {
  const challenges = useChallenges(pledgeId);
  return (
    <Card title="Challenges on this pledge">
      <QueryState query={challenges} loadingLabel="Reading challenges…">
        {(list) => <ChallengeTable challenges={[...list].reverse()} empty="No challenge on this pledge." showPledge={false} />}
      </QueryState>
    </Card>
  );
}

function PledgeContent() {
  const raw = useSearchParams().get("id");
  const id = parseIdParam(raw);
  const pledge = usePledge(id);
  if (id === null) {
    return (
      <NotFound title="Invalid pledge id">
        <p>
          The address must end with <code>?id=</code> and a pledge number, for example{" "}
          <InternalLink href="/pledge/?id=0">/pledge/?id=0</InternalLink>.
        </p>
      </NotFound>
    );
  }
  return (
    <QueryState
      query={pledge}
      loadingLabel={`Reading pledge ${id}…`}
      notFound={
        <NotFound title={`Pledge ${id} does not exist`}>
          <p>
            The contract has no pledge with this id. See the <InternalLink href="/">list of pledges</InternalLink>.
          </p>
        </NotFound>
      }
    >
      {(p) => <PledgeDetails pledge={p} />}
    </QueryState>
  );
}

export default function PledgePage() {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <PledgeContent />
      </Suspense>
    </Shell>
  );
}
