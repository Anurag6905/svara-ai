import type { Metadata } from "next";
import { Card, CardHeader, Notice, PageHeader, Stat } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { getAnalytics } from "@/lib/analytics";
import { OUTCOMES, type Outcome } from "@/lib/conversation/engine";
import { LEAD_STATUS_META } from "@/lib/leads";
import type { LeadStatus } from "@/db/enums";

export const metadata: Metadata = { title: "Analytics" };

function Bars({ items, total, empty }: { items: [string, number][]; total?: number; empty: string }) {
  const max = Math.max(1, ...items.map(([, n]) => n));
  if (items.length === 0) return <p className="px-5 py-6 text-[13px] text-ink-4">{empty}</p>;
  return (
    <ul className="space-y-3 px-5 py-5">
      {items.map(([label, n]) => (
        <li key={label}>
          <div className="mb-1 flex justify-between gap-3 text-[13px]">
            <span className="truncate text-ink-2">{label}</span>
            <span className="tabular shrink-0 font-medium">
              {n}
              {total ? <span className="ml-1.5 font-normal text-ink-4">{Math.round((n / total) * 100)}%</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-ink" style={{ width: `${(n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function AnalyticsPage() {
  const { ctx } = await requirePermission("analytics.view");
  const a = await getAnalytics(getDb(), ctx);
  const outcomeItems = (Object.keys(OUTCOMES) as Outcome[]).filter((k) => a.outcomes[k]).map((k) => [OUTCOMES[k], a.outcomes[k]!] as [string, number]);
  const statusItems = Object.entries(a.leadsByStatus)
    .sort((x, y) => y[1] - x[1])
    .map(([k, n]) => [LEAD_STATUS_META[k as LeadStatus]?.label ?? k, n] as [string, number]);
  const correctionRate = a.profiles ? Math.round((a.corrections / (a.profiles * 3)) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Analytics"
        description="Operational and customer-experience indicators. Quality and opt-outs sit next to volume on purpose — more leads is not success if calls are intrusive or briefs are wrong."
      />
      <Notice tone="sim" title="Simulation data only">
        All {a.simulations} conversations are simulations with synthetic leads. Live calls: {a.liveCalls}. These numbers say nothing about real conversion and must not be quoted as results.
      </Notice>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Simulations completed" value={a.simulations} hint={`Live calls: ${a.liveCalls}`} />
        <Stat label="Awaiting human review" value={a.awaitingReview} hint={`${a.reviewed} reviewed`} />
        <Stat label="Average conversation" value={`${Math.floor(a.avgDurationSec / 60)}:${String(a.avgDurationSec % 60).padStart(2, "0")}`} hint="Simulated duration" />
        <Stat label="Follow-ups requested" value={(a.outcomes.INTERESTED_FOLLOW_UP ?? 0) + (a.outcomes.CALLBACK_REQUESTED ?? 0)} hint="Interested or callback" />
      </div>

      <h2 className="mb-3 mt-10 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-3">Quality &amp; customer experience</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Opt-outs" value={a.optOuts} hint="Suppressed permanently" />
        <Stat label="Escalations to a person" value={a.escalations} hint="Customer request or reviewer" />
        <Stat label="Fields corrected by reviewers" value={a.corrections} hint={`≈${correctionRate}% of core fields`} />
        <Stat label="Product suggestions overridden" value={a.matchOverrides} hint={`of ${a.matchDecisions} reviewed`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Conversation outcomes" />
          <Bars items={outcomeItems} total={a.simulations} empty="No conversations yet." />
        </Card>
        <Card>
          <CardHeader title="Leads by status" description={`${a.totalLeads} leads`} />
          <Bars items={statusItems} total={a.totalLeads} empty="No leads yet." />
        </Card>
        <Card>
          <CardHeader title="Most common stated purposes" description="Customer-stated only" />
          <Bars items={a.purposes} empty="No purposes captured yet." />
        </Card>
        <Card>
          <CardHeader title="Missing-information frequency" description="Core fields the customer didn't state" />
          <Bars items={a.missing} total={a.profiles} empty="Nothing missing." />
        </Card>
      </div>
      <p className="mt-6 text-xs text-ink-4">
        Complaints recorded: {a.complaints}. Incorrect-information rate needs live reviewer tagging and will be measured in a pilot.
      </p>
    </>
  );
}
