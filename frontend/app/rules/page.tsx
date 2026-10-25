import { Card } from "@/components/bits";
import { Shell } from "@/components/Shell";
import { RULES } from "@/lib/contracts/types";
import { LIMITS, RULE_TEXT } from "@/lib/rules";
import { CHALLENGE_LABEL, CHALLENGE_SETTLEMENT } from "@/lib/status";

const SETTLED = ["UPHELD", "REJECTED", "QUOTE_NOT_FOUND", "EXPIRED"] as const;

export default function RulesPage() {
  return (
    <Shell>
      <h1 className="mb-2 text-3xl font-bold">Rules</h1>
      <p className="mb-6 max-w-3xl text-muted-foreground">
        Each challenge names exactly one of these three fixed rules. The text below is the contract&apos;s{" "}
        <code>RULE_TEXT</code>, word for word; validators receive the same text with the quote and the archived page.
        The rules follow the spirit of EU Directive 2024/825 but this is a testnet demo, not legal advice.
      </p>

      <div className="space-y-6">
        {RULES.map((rule) => (
          <Card key={rule} title={`Rule ${rule}`}>
            <p className="whitespace-pre-line leading-relaxed">{RULE_TEXT[rule]}</p>
          </Card>
        ))}

        <Card title="How a challenge is judged">
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              The challenger quotes {LIMITS.QUOTE_MIN_LEN} to {LIMITS.QUOTE_MAX_LEN} characters from one covered page,
              names one rule and one Wayback Machine capture, and stakes at least the pledge&apos;s minimum stake
              (one tenth of its payout).
            </li>
            <li>The capture must be taken between the pledge creation and the filing of the challenge.</li>
            <li>
              The payout is reserved from the bond while the challenge is open. Only one open challenge is allowed per
              page and rule.
            </li>
            <li>
              Anyone can call resolve for {LIMITS.RESOLVE_WINDOW_DAYS} days after filing. Validators fetch the capture,
              look for the quote and judge it against the rule. After the deadline, anyone can call expire.
            </li>
            <li>A brand cannot challenge its own pledge, and no challenge is accepted once coverage has ended.</li>
          </ul>
        </Card>

        <Card title="Settlement">
          <dl className="space-y-3 text-sm">
            {SETTLED.map((status) => (
              <div key={status}>
                <dt className="font-medium">{CHALLENGE_LABEL[status]}</dt>
                <dd className="text-muted-foreground">{CHALLENGE_SETTLEMENT[status]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            A brand&apos;s standing counts upheld and rejected challenges only.
          </p>
        </Card>
      </div>
    </Shell>
  );
}
