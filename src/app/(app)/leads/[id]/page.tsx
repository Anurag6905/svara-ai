import { ArrowLeft, AudioLines, Ban, CheckCircle2, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { approveLeadAction, recordOptOutAction } from "@/app/actions/domain";
import { ActionButton } from "@/components/action-button";
import { LeadStatusBadge } from "@/components/domain";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { OUTCOMES, type Outcome } from "@/lib/conversation/engine";
import { listConversations } from "@/lib/conversations";
import { getLead, maskPhone } from "@/lib/leads";
import { NotFoundError } from "@/lib/tenant";

export const metadata: Metadata = { title: "Lead" };

const dt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requirePermission("leads.view");
  const { id } = await params;
  const db = getDb();
  let lead;
  try {
    lead = await getLead(db, ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const convs = await listConversations(db, ctx, { leadId: lead.id });
  const optedOut = lead.status === "OPTED_OUT";

  const rows: [string, string | null][] = [
    ["Lead ID", lead.externalLeadId],
    ["Phone", maskPhone(lead.phoneNumber)],
    ["Loan category", lead.category],
    ["Lead source", lead.source],
    ["Enquiry date", lead.enquiryDate],
    ["Preferred language", lead.preferredLanguage],
  ];
  const perm: [string, string | null][] = [
    ["Permission status", lead.permissionStatus],
    ["Recorded at", lead.permissionTimestamp],
    ["Source", lead.permissionSource],
    ["Evidence reference", lead.permissionReference],
    ["Do-not-call check", lead.doNotCallStatus],
  ];

  return (
    <>
      <Link href="/leads" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> All leads
      </Link>
      <PageHeader
        eyebrow={lead.externalLeadId}
        title={lead.firstName ?? "Unnamed lead"}
        description={<span className="inline-flex items-center gap-2"><LeadStatusBadge status={lead.status} /> <Badge>Synthetic</Badge></span>}
        actions={
          <>
            {can(ctx.role, "leads.approve_pilot") && lead.status === "READY_FOR_TEST" && lead.gate.allowed && (
              <ActionButton action={approveLeadAction.bind(null, lead.id)}>Approve for pilot</ActionButton>
            )}
            {can(ctx.role, "simulator.run") &&
              (lead.gate.allowed ? (
                <ButtonLink href={`/simulator?lead=${lead.id}`} variant="primary">
                  <AudioLines className="size-4" /> Simulate conversation
                </ButtonLink>
              ) : null)}
          </>
        }
      />

      {optedOut ? (
        <Notice tone="danger" icon={Ban} title="Opted out — permanently suppressed">
          This customer asked not to be contacted. They cannot enter the simulator or any calling workflow, and no one in the product can reverse this.
        </Notice>
      ) : lead.gate.allowed ? (
        <Notice tone="ok" icon={CheckCircle2} title="Permission record complete">
          This lead may be used in simulated conversations. A live pilot would additionally need the lender&apos;s written approval.
        </Notice>
      ) : (
        <Notice tone="warn" icon={ShieldAlert} title="Blocked from any calling workflow">
          {lead.gate.reasons.join(" · ")}. Fix the permission record in the source system and re-import.
        </Notice>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Lead details" />
          <dl className="divide-y divide-line">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-3 text-[13px]">
                <dt className="text-ink-3">{k}</dt>
                <dd className="text-right text-ink">{v ?? <span className="text-ink-4">Not provided</span>}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Permission record" description="Supplied by the lender. SVARA never collects or invents permission." />
          <dl className="divide-y divide-line">
            {perm.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-3 text-[13px]">
                <dt className="text-ink-3">{k}</dt>
                <dd className="text-right font-mono text-xs text-ink">{v ?? <span className="font-sans text-warn">Missing</span>}</dd>
              </div>
            ))}
          </dl>
          {!optedOut && ctx.role !== "ANALYST" && (
            <div className="flex justify-end border-t border-line px-5 py-3">
              <ActionButton
                action={recordOptOutAction.bind(null, lead.id)}
                size="sm"
                variant="danger"
                confirm="Record an opt-out for this customer? This is permanent and cannot be undone in the product."
              >
                Record opt-out
              </ActionButton>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Conversations" description="Simulations are labelled and reported separately from any live calls." />
        {convs.length === 0 ? (
          <EmptyState icon={AudioLines} title="No conversations yet" description={lead.gate.allowed ? "Run a simulation to see the structured need profile." : "This lead is blocked, so no conversations can be run."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Mode</Th>
                <Th>Outcome</Th>
                <Th>Review</Th>
              </tr>
            </thead>
            <tbody>
              {convs.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/conversations/${c.id}`} className="font-medium hover:underline">
                      {dt.format(c.startedAt)}
                    </Link>
                  </Td>
                  <Td><Badge tone="sim">{c.mode === "SIMULATION" ? "Simulation" : "Live"}</Badge></Td>
                  <Td className="text-ink-2">{c.outcome ? OUTCOMES[c.outcome as Outcome] : "—"}</Td>
                  <Td><Badge tone={c.status === "REVIEWED" ? "ok" : "warn"}>{c.status === "REVIEWED" ? "Reviewed" : "Awaiting review"}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
