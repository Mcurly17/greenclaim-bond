"use client";

import { useState } from "react";
import { Card, Pager } from "@/components/bits";
import { ChallengeTable } from "@/components/lists";
import { QueryState } from "@/components/QueryState";
import { Shell } from "@/components/Shell";
import { useAllChallenges } from "@/lib/contracts/greenClaim";

export default function ChallengesPage() {
  const [page, setPage] = useState(0);
  const challenges = useAllChallenges(page);
  return (
    <Shell>
      <h1 className="mb-6 text-3xl font-bold">Challenges</h1>
      <Card>
        <QueryState query={challenges} loadingLabel="Reading challenges…">
          {(result) => (
            <>
              <ChallengeTable challenges={result.items} empty="No challenge yet." />
              <Pager page={page} pageCount={result.pageCount} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </Shell>
  );
}
