"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Amount, Card, ChallengePill, ExternalLink, InternalLink, Time, useNow } from "@/components/bits";
import { TxStatus } from "@/components/TxStatus";
import { CONFIG } from "@/lib/config";
import { readGreenClaim, useWrite, wei, type WriteResult } from "@/lib/contracts/greenClaim";
import { RULES, type ChallengeStatus, type ChallengeView, type PledgeView, type Rule } from "@/lib/contracts/types";
import { formatWei, parseGen, toWei } from "@/lib/format";
import { WALLET_INSTALL_URL } from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet";
import { waybackCalendar } from "@/lib/links";
import { LIMITS, RULE_TEXT, ruleTitle } from "@/lib/rules";
import { CHALLENGE_SETTLEMENT, challengeLabel, resolveWindow } from "@/lib/status";
import { canWithdraw, codePointLength, compact, isBrand, validateChallenge } from "@/lib/validate";

export const inputClass =
  "w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50";
export const buttonClass =
  "rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * `?checks=off` shows every action and skips client checks, so contract refusals
 * can be tested. Development server only: NODE_ENV is inlined at build time, so
 * the exported site folds this to `false` (scripts/check-export.mjs verifies it).
 */
export function useChecksOff(): boolean {
  const params = useSearchParams();
  return process.env.NODE_ENV === "development" && params.get("checks") === "off";
}

export function ChecksOffNote() {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <p className="mb-4 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-xs">
      Client-side checks are off (<code>?checks=off</code>): every action is shown and the contract alone decides.
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-300">{error}</span>}
    </label>
  );
}

export function ConnectPrompt({ action }: { action: string }) {
  const { connectWallet, hasWallet, isLoading } = useWallet();
  if (!hasWallet) {
    return (
      <p className="text-sm text-muted-foreground">
        No browser wallet found. <ExternalLink href={WALLET_INSTALL_URL}>Install a wallet extension</ExternalLink> to{" "}
        {action}.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-muted-foreground">Connect a wallet to {action}.</span>
      <button className={buttonClass} disabled={isLoading} onClick={() => connectWallet().catch(() => undefined)}>
        Connect wallet
      </button>
    </div>
  );
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Reads the challenge again until the contract reports it settled (the node may lag a few seconds). */
async function rereadSettled(id: number): Promise<ChallengeView | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const c = await readGreenClaim<ChallengeView>("get_challenge", [id]);
      if (c.status !== "OPEN") return c;
    } catch {
      // Keep trying: the result is already confirmed, only the display waits.
    }
    await sleep(3_000);
  }
  return null;
}

function hasActivity(write: { isPending: boolean; data?: unknown; error: unknown }): boolean {
  return write.isPending || write.data !== undefined || write.error !== null;
}

// ---------------------------------------------------------------------------
// Pledge: brand actions
// ---------------------------------------------------------------------------

function TopUp({ pledge, checksOff }: { pledge: PledgeView; checksOff: boolean }) {
  const write = useWrite();
  const [amount, setAmount] = useState("");
  let value: bigint | null = null;
  try {
    value = parseGen(amount);
  } catch {
    value = null;
  }
  const valid = value !== null && value > 0n;
  const allowed = pledge.active || checksOff;
  if (!allowed && !hasActivity(write)) return null;
  return (
    <div>
      <h3 className="mb-2 font-medium">Top up the bond</h3>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (value !== null && (valid || checksOff)) {
            write.mutate({ functionName: "top_up", args: [pledge.id], valueWei: value.toString() });
          }
        }}
      >
        <div className="w-48">
          <Field label={`Amount (${CONFIG.symbol})`} error={amount && !valid ? "Enter an amount greater than 0." : undefined}>
            <input className={inputClass} inputMode="decimal" placeholder="0.05" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>
        <button className={buttonClass} disabled={write.isPending || !allowed || value === null || (!valid && !checksOff)}>
          Top up
        </button>
      </form>
      <TxStatus
        isPending={write.isPending}
        progress={write.progress}
        result={write.data}
        error={write.error}
        renderSuccess={(r) => (
          <p className="mt-1">
            New bond: <Amount value={r.outcome.returnValue} />
          </p>
        )}
      />
    </div>
  );
}

function Withdraw({ pledge, account, checksOff }: { pledge: PledgeView; account: string | null; checksOff: boolean }) {
  const write = useWrite();
  const now = useNow();
  const allowed = canWithdraw(pledge, account, now) || checksOff;
  if (!allowed && !hasActivity(write)) {
    return (
      <p className="text-sm text-muted-foreground">
        {toWei(pledge.available) > 0n ? (
          <>
            Withdrawing the available bond opens when coverage ends (<Time iso={pledge.ends_at} relative />).
          </>
        ) : (
          "Nothing is available to withdraw."
        )}
      </p>
    );
  }
  return (
    <div>
      <h3 className="mb-2 font-medium">Withdraw</h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Sends the available bond (<Amount value={pledge.available} />) back to the brand and closes the pledge. Amounts reserved
        for open challenges stay until they are settled.
      </p>
      <button
        className={buttonClass}
        disabled={write.isPending || !allowed}
        onClick={() => write.mutate({ functionName: "withdraw", args: [pledge.id] })}
      >
        Withdraw available bond
      </button>
      <TxStatus
        isPending={write.isPending}
        progress={write.progress}
        result={write.data}
        error={write.error}
        renderSuccess={(r) => (
          <p className="mt-1">
            Withdrawn: <Amount value={r.outcome.returnValue} />
          </p>
        )}
      />
    </div>
  );
}

export function BrandActions({ pledge }: { pledge: PledgeView }) {
  const { address } = useWallet();
  const checksOff = useChecksOff();
  if (!isBrand(pledge, address) && !checksOff) return null;
  return (
    <Card title="Brand actions">
      {checksOff && <ChecksOffNote />}
      <div className="space-y-6">
        <TopUp pledge={pledge} checksOff={checksOff} />
        <Withdraw pledge={pledge} account={address} checksOff={checksOff} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pledge: challenge form
// ---------------------------------------------------------------------------

export function ChallengeForm({ pledge, challenges }: { pledge: PledgeView; challenges: ChallengeView[] }) {
  const { address, isConnected } = useWallet();
  const checksOff = useChecksOff();
  const now = useNow(5_000);
  const write = useWrite();
  const [pageIndex, setPageIndex] = useState(0);
  const [rule, setRule] = useState("R1");
  const [quote, setQuote] = useState("");
  const [snapshotTs, setSnapshotTs] = useState("");
  const [stake, setStake] = useState(() => formatWei(pledge.min_stake));

  const { errors, call } = validateChallenge(
    { pageIndex, rule, quote, snapshotTs, stake },
    { pledge, challenges, account: address, nowMs: now },
  );
  const blocked = Object.keys(errors).length > 0;
  const quoteLength = codePointLength(compact(quote));
  const page = pledge.pages[pageIndex] ?? pledge.pages[0];
  const touched = quote !== "" || snapshotTs !== "";

  if (errors.pledge && !checksOff && !hasActivity(write)) {
    return (
      <Card title="Challenge a sentence">
        <p className="text-sm text-muted-foreground">{errors.pledge}</p>
      </Card>
    );
  }

  return (
    <Card title="Challenge a sentence">
      {checksOff && <ChecksOffNote />}
      {!isConnected ? (
        <ConnectPrompt action="challenge this pledge" />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!call || (blocked && !checksOff)) return;
            write.mutate({ functionName: "challenge", args: call.args, valueWei: call.valueWei });
          }}
        >
          <p className="text-sm text-muted-foreground">
            Quote one sentence from a Wayback Machine capture of a covered page and pick the rule it breaks. Validators read
            that capture; if they uphold the challenge you receive your stake plus the payout, otherwise your stake goes to
            the bond and to the challenger pool.
          </p>
          {checksOff && errors.pledge && <p className="text-xs text-amber-300">Client check skipped: {errors.pledge}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Page" error={errors.pageIndex}>
              <select className={inputClass} value={pageIndex} onChange={(e) => setPageIndex(Number(e.target.value))}>
                {pledge.pages.map((url, i) => (
                  <option key={i} value={i}>
                    #{i} {url}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rule" error={errors.rule} hint={RULE_TEXT[rule as Rule]}>
              <select className={inputClass} value={rule} onChange={(e) => setRule(e.target.value)}>
                {RULES.map((r) => (
                  <option key={r} value={r}>
                    {r}: {ruleTitle(r)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label="Quoted sentence"
            error={touched ? errors.quote : undefined}
            hint={`${quoteLength} / ${LIMITS.QUOTE_MAX_LEN} characters after spaces and quotes are normalized (minimum ${LIMITS.QUOTE_MIN_LEN}). Copy it exactly from the capture.`}
          >
            <textarea className={`${inputClass} min-h-24`} value={quote} onChange={(e) => setQuote(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Wayback capture timestamp"
              error={touched ? errors.snapshotTs : undefined}
              hint={
                <>
                  14 digits from the capture URL (web.archive.org/web/<b>YYYYMMDDhhmmss</b>/…), taken after the pledge was
                  created. <ExternalLink href={waybackCalendar(page)}>Find captures of this page</ExternalLink>
                </>
              }
            >
              <input
                className={`${inputClass} font-mono`}
                inputMode="numeric"
                placeholder="YYYYMMDDhhmmss"
                value={snapshotTs}
                onChange={(e) => setSnapshotTs(e.target.value.trim())}
              />
            </Field>
            <Field label={`Stake (${CONFIG.symbol})`} error={errors.stake} hint={<>Minimum <Amount value={pledge.min_stake} /></>}>
              <input className={inputClass} inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
            </Field>
          </div>
          <button className={buttonClass} disabled={write.isPending || !call || (blocked && !checksOff)}>
            File challenge
          </button>
        </form>
      )}
      <TxStatus
        isPending={write.isPending}
        progress={write.progress}
        result={write.data}
        error={write.error}
        renderSuccess={(r) => <CreatedLink result={r} kind="challenge" />}
      />
    </Card>
  );
}

export function CreatedLink({ result, kind }: { result: WriteResult; kind: "pledge" | "challenge" }) {
  const id = result.outcome.returnValue;
  if (typeof id !== "number" && !(typeof id === "string" && /^\d+$/.test(id))) {
    return <p className="mt-1">The {kind} was created; its id could not be read from the receipt.</p>;
  }
  const label = kind === "pledge" ? "Pledge" : "Challenge";
  return (
    <p className="mt-1">
      {label} {String(id)} created. <InternalLink href={`/${kind}/?id=${id}`}>Open {kind} {String(id)}</InternalLink>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Challenge: resolve and expire
// ---------------------------------------------------------------------------

function SettledResult({ settled, pending }: { settled: ChallengeView | null; pending: boolean }) {
  if (pending) return <p className="mt-1">Reading the challenge again…</p>;
  if (!settled) return <p className="mt-1">The challenge is settled; refresh the page to see its status.</p>;
  return (
    <div className="mt-2 space-y-1">
      <p className="flex flex-wrap items-center gap-2">
        Status read from the contract: <ChallengePill status={settled.status} />
      </p>
      {settled.reason && <p className="text-muted-foreground">{settled.reason}</p>}
      <p className="text-muted-foreground">{CHALLENGE_SETTLEMENT[settled.status as ChallengeStatus] ?? ""}</p>
    </div>
  );
}

function useSettle(fn: "resolve" | "expire", id: number) {
  const write = useWrite();
  const [settled, setSettled] = useState<ChallengeView | null>(null);
  const [rereading, setRereading] = useState(false);
  const run = () => {
    setSettled(null);
    write.mutate(
      { functionName: fn, args: [id] },
      {
        onSuccess: async (r) => {
          if (r.outcome.kind !== "success") return;
          setRereading(true);
          setSettled(await rereadSettled(id));
          setRereading(false);
        },
      },
    );
  };
  return { write, run, settled, rereading };
}

export function ChallengeActions({ challenge }: { challenge: ChallengeView }) {
  const { isConnected } = useWallet();
  const checksOff = useChecksOff();
  const now = useNow(5_000);
  const window = resolveWindow(challenge, now);
  const resolve = useSettle("resolve", challenge.id);
  const expire = useSettle("expire", challenge.id);
  const showResolve = window === "resolvable" || checksOff || hasActivity(resolve.write);
  const showExpire = window === "expirable" || checksOff || hasActivity(expire.write);
  if (!showResolve && !showExpire) return null;
  const busy = resolve.write.isPending || expire.write.isPending;

  return (
    <Card title="Settle this challenge">
      {checksOff && <ChecksOffNote />}
      {!isConnected ? (
        <ConnectPrompt action={window === "expirable" ? "expire this challenge" : "resolve this challenge"} />
      ) : (
        <div className="space-y-6">
          {showResolve && (
            <div>
              <p className="mb-3 text-sm text-muted-foreground">
                Anyone can ask the validators to judge this challenge until the resolve deadline. Each validator fetches the
                capture and applies the rule; the result is final once they agree. This takes a few minutes.
              </p>
              <button className={buttonClass} disabled={busy || (window !== "resolvable" && !checksOff)} onClick={resolve.run}>
                Resolve with validators
              </button>
              <TxStatus
                isPending={resolve.write.isPending}
                progress={resolve.write.progress}
                result={resolve.write.data}
                error={resolve.write.error}
                onRetry={window === "resolvable" && !busy ? resolve.run : undefined}
                renderSuccess={() => <SettledResult settled={resolve.settled} pending={resolve.rereading} />}
              />
            </div>
          )}
          {showExpire && (
            <div>
              <p className="mb-3 text-sm text-muted-foreground">
                The resolve deadline has passed without a verdict. Expiring refunds the stake to the challenger and releases
                the reserved payout. {challengeLabel("EXPIRED")} challenges do not count in the brand standing.
              </p>
              <button className={buttonClass} disabled={busy || (window !== "expirable" && !checksOff)} onClick={expire.run}>
                Expire challenge
              </button>
              <TxStatus
                isPending={expire.write.isPending}
                progress={expire.write.progress}
                result={expire.write.data}
                error={expire.write.error}
                renderSuccess={() => <SettledResult settled={expire.settled} pending={expire.rereading} />}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
