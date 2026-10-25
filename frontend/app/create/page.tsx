"use client";

import { Suspense, useState } from "react";
import { buttonClass, ChecksOffNote, ConnectPrompt, CreatedLink, Field, inputClass, useChecksOff } from "@/components/actions";
import { Card, InternalLink } from "@/components/bits";
import { Loading, MissingContract } from "@/components/QueryState";
import { Shell } from "@/components/Shell";
import { TxStatus } from "@/components/TxStatus";
import { CONFIG } from "@/lib/config";
import { useWrite, wei } from "@/lib/contracts/greenClaim";
import { useWallet } from "@/lib/genlayer/wallet";
import { LIMITS } from "@/lib/rules";
import { validateCreate, type CreateInput } from "@/lib/validate";

const EMPTY: CreateInput = { name: "", domain: "", pages: "", payout: "", days: "30", bond: "" };

function CreateForm() {
  const { isConnected } = useWallet();
  const checksOff = useChecksOff();
  const write = useWrite();
  const [form, setForm] = useState<CreateInput>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const { errors, call } = validateCreate(form);
  const blocked = Object.keys(errors).length > 0;
  const show = (field: keyof CreateInput) => (submitted || form[field] !== EMPTY[field] ? errors[field] : undefined);
  const set = (field: keyof CreateInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <Card>
      {checksOff && <ChecksOffNote />}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (!call || (blocked && !checksOff)) return;
          write.mutate({
            functionName: "create_pledge",
            args: [call.name, call.domain, call.pagesJson, wei(call.payoutWei), call.days],
            valueWei: call.valueWei,
          });
        }}
      >
        <Field label="Product or campaign name" error={show("name")} hint={`Up to ${LIMITS.NAME_MAX_LEN} characters.`}>
          <input className={inputClass} value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Domain" error={show("domain")} hint="Covered pages must be on this domain or its www. subdomain.">
          <input className={`${inputClass} font-mono`} placeholder="example.com" value={form.domain} onChange={set("domain")} />
        </Field>
        <Field
          label="Covered pages"
          error={show("pages")}
          hint={`1 to ${LIMITS.MAX_PAGES} https URLs, one per line. Challengers quote these pages from Wayback Machine captures.`}
        >
          <textarea
            className={`${inputClass} min-h-24 font-mono`}
            placeholder="https://example.com/product"
            value={form.pages}
            onChange={set("pages")}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={`Bond (${CONFIG.symbol})`}
            error={show("bond")}
            hint="Locked now. Top-ups are possible while the pledge is active."
          >
            <input className={inputClass} inputMode="decimal" placeholder="0.2" value={form.bond} onChange={set("bond")} />
          </Field>
          <Field
            label={`Payout per upheld challenge (${CONFIG.symbol})`}
            error={show("payout")}
            hint="Paid from the bond. The minimum stake is a tenth of it."
          >
            <input className={inputClass} inputMode="decimal" placeholder="0.1" value={form.payout} onChange={set("payout")} />
          </Field>
          <Field label="Coverage (days)" error={show("days")} hint={`${LIMITS.MIN_DAYS} to ${LIMITS.MAX_DAYS}.`}>
            <input className={inputClass} inputMode="numeric" value={form.days} onChange={set("days")} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          During coverage anyone can challenge a sentence of these pages under the <InternalLink href="/rules/">rules</InternalLink>.
          After it ends you can withdraw what is not reserved for open challenges.
        </p>
        {isConnected ? (
          <button className={buttonClass} disabled={write.isPending || !call || (submitted && blocked && !checksOff)}>
            Create pledge
          </button>
        ) : (
          <ConnectPrompt action="create a pledge" />
        )}
      </form>
      <TxStatus
        isPending={write.isPending}
        progress={write.progress}
        result={write.data}
        error={write.error}
        renderSuccess={(r) => <CreatedLink result={r} kind="pledge" />}
      />
    </Card>
  );
}

export default function CreatePage() {
  return (
    <Shell>
      <h1 className="mb-2 text-3xl font-bold">Create a pledge</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        A brand locks a bond behind the environmental claims of its pages. The account that signs becomes the brand.
      </p>
      {CONFIG.contractAddress ? (
        <Suspense fallback={<Loading />}>
          <CreateForm />
        </Suspense>
      ) : (
        <MissingContract />
      )}
    </Shell>
  );
}
