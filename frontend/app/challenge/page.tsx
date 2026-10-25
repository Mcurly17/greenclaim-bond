"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Address, Amount, Card, ChallengePill, ExternalLink, Facts, InternalLink, Time, useNow } from "@/components/bits";
import { Loading, NotFound, QueryState } from "@/components/QueryState";
import { Shell } from "@/components/Shell";
import { useChallenge, usePledge } from "@/lib/contracts/greenClaim";
import type { ChallengeStatus, ChallengeView } from "@/lib/contracts/types";
import { snapshotToIso } from "@/lib/format";
import { waybackUrl, waybackView } from "@/lib/links";
import { parseIdParam } from "@/lib/params";
import { RULE_TEXT, ruleTitle } from "@/lib/rules";
import { CHALLENGE_SETTLEMENT, resolveWindow } from "@/lib/status";

function Snapshot({ ts, page }: { ts: string; page: string | null }) {
  const iso = snapshotToIso(ts);
  return (
    <span>
      <span className="font-mono">{ts}</span>
      {iso && <span className="ml-2 text-xs text-muted-foreground">({iso.replace("T", " ").replace("Z", " UTC")})</span>}
      {page && (
        <span className="mt-1 flex flex-wrap gap-x-4 text-xs">
          <ExternalLink href={waybackView(ts, page)}>View capture</ExternalLink>
          <ExternalLink href={waybackUrl(ts, page)}>Raw capture read by validators</ExternalLink>
        </span>
      )}
    </span>
  );
}

function ResolveState({ challenge }: { challenge: ChallengeView }) {
  const now = useNow();
  const window = resolveWindow(challenge, now);
  if (window === "settled") return null;
  return (
    <p className="mt-4 text-sm text-muted-foreground">
      {window === "resolvable"
        ? "Open: anyone can ask the validators to resolve this challenge until the resolve deadline."
        : "The resolve deadline has passed: anyone can now expire this challenge, which refunds the stake."}
    </p>
  );
}

function ChallengeDetails({ challenge }: { challenge: ChallengeView }) {
  const pledge = usePledge(challenge.pledge_id);
  const page = pledge.data?.pages[challenge.page_index] ?? null;
  const rule = challenge.rule in RULE_TEXT ? challenge.rule : null;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">Challenge {challenge.id}</h1>
        <ChallengePill status={challenge.status} />
      </div>
      <div className="space-y-6">
        <Card title="Challenged sentence">
          <blockquote className="border-l-2 border-accent pl-4 text-lg">“{challenge.quote}”</blockquote>
          <div className="mt-5">
            <Facts
              rows={[
                [
                  "Pledge",
                  <InternalLink key="p" href={`/pledge/?id=${challenge.pledge_id}`}>
                    {pledge.data ? `${pledge.data.name} (#${challenge.pledge_id})` : `#${challenge.pledge_id}`}
                  </InternalLink>,
                ],
                [
                  "Page",
                  page ? (
                    <ExternalLink key="u" href={page}>{`#${challenge.page_index} ${page}`}</ExternalLink>
                  ) : (
                    <span key="u">#{challenge.page_index}</span>
                  ),
                ],
                ["Snapshot challenged", <Snapshot key="s" ts={challenge.snapshot_ts} page={page} />],
                [
                  "Capture judged",
                  challenge.judged_ts ? (
                    <Snapshot key="j" ts={challenge.judged_ts} page={page} />
                  ) : (
                    <span key="j" className="text-muted-foreground">Not judged yet</span>
                  ),
                ],
              ]}
            />
          </div>
        </Card>

        <Card title={rule ? `Rule ${rule}: ${ruleTitle(rule)}` : `Rule ${challenge.rule}`}>
          {rule ? (
            <p className="text-sm text-muted-foreground">
              {RULE_TEXT[rule]} <InternalLink href="/rules/">All rules</InternalLink>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Unknown rule.</p>
          )}
        </Card>

        <Card title="Outcome">
          <Facts
            rows={[
              ["Status", <ChallengePill key="st" status={challenge.status} />],
              [
                "Validators' reason",
                challenge.reason ? <span key="r">{challenge.reason}</span> : <span key="r" className="text-muted-foreground">—</span>,
              ],
              ["Challenger", <Address key="c" value={challenge.challenger} />],
              ["Stake", <Amount key="k" value={challenge.stake} />],
              ["Opened", <Time key="o" iso={challenge.opened_at} />],
              ["Resolve deadline", <Time key="d" iso={challenge.resolve_deadline} relative={challenge.status === "OPEN"} />],
            ]}
          />
          <p className="mt-4 text-sm">{CHALLENGE_SETTLEMENT[challenge.status as ChallengeStatus] ?? ""}</p>
          <ResolveState challenge={challenge} />
        </Card>
      </div>
    </>
  );
}

function ChallengeContent() {
  const id = parseIdParam(useSearchParams().get("id"));
  const challenge = useChallenge(id);
  if (id === null) {
    return (
      <NotFound title="Invalid challenge id">
        <p>
          The address must end with <code>?id=</code> and a challenge number, for example{" "}
          <InternalLink href="/challenge/?id=0">/challenge/?id=0</InternalLink>.
        </p>
      </NotFound>
    );
  }
  return (
    <QueryState
      query={challenge}
      loadingLabel={`Reading challenge ${id}…`}
      notFound={
        <NotFound title={`Challenge ${id} does not exist`}>
          <p>
            The contract has no challenge with this id. See <InternalLink href="/challenges/">all challenges</InternalLink>.
          </p>
        </NotFound>
      }
    >
      {(c) => <ChallengeDetails challenge={c} />}
    </QueryState>
  );
}

export default function ChallengePage() {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <ChallengeContent />
      </Suspense>
    </Shell>
  );
}
