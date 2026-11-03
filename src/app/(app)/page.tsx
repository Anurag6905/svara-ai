import { and, count, eq, gte } from "drizzle-orm";
import {
  Activity,
  CheckCircle2,
  Circle,
  ShieldCheck,
  ShieldX,
  Users,
  KeyRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { listConversations } from "@/lib/conversations";
import { listLeads } from "@/lib/leads";
import { Badge, Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { getDb } from "@/db/client";
import { auditEvents, users } from "@/db/schema";
import { permissionsFor, ROLE_LABELS } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";
import { MILESTONES } from "@/lib/build-status";

export const metadata: Metadata = { title: "Overview" };

const PERMISSION_LABELS: Record<string, string> = {
  "users.manage": "Manage users and roles",
  "audit.view": "View audit log",
  "products.view": "View product catalogue",
  "products.manage": "Edit product catalogue",
  "leads.view": "View leads",
  "leads.import": "Import leads",
  "leads.approve_pilot": "Approve pilot batches",
  "simulator.run": "Run simulated conversations",
  "reviews.write": "Review and correct profiles",
  "exports.download": "Export results",
  "analytics.view": "View analytics",
};

const DOES = [
  "Structures the customer's stated purpose, amount and timeline",
  "Links every extracted field to transcript evidence",
  "Suggests lender-approved products with the reason for each",
  "Hands a concise brief to a human for review",
];
const DOES_NOT = [
  "Approve, reject or score loan applications",
  "Promise eligibility, rates or approval",
  "Call anyone without recorded permission",
  "Override an opt-out",
];

export default async function OverviewPage() {
  const { user, organisation, ctx } = await requireSession();
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [[members], [activity]] = await Promise.all([
    db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.organisationId, ctx.organisationId), eq(users.status, "ACTIVE"))),
    db
      .select({ n: count() })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organisationId, ctx.organisationId),
          gte(auditEvents.timestamp, weekAgo),
        ),
      ),
  ]);

  const perms = permissionsFor(ctx.role);
  const leadRows = await listLeads(db, ctx);
  const convRows = await listConversations(db, ctx);
  const firstName = user.name.split(" ")[0];
  const doneCount = MILESTONES.filter((m) => m.done).length;

  return (
    <>
      <PageHeader
        eyebrow={organisation.shortName}
        title={`Welcome back, ${firstName}`}
        description="Your lending-sales workspace: permissioned leads in, evidence-backed credit-need briefs out — with a person reviewing every one."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Leads" value={leadRows.length} hint={`${leadRows.filter((l) => l.gate.allowed).length} permissioned`} icon={Users} />
        <Stat label="Simulated conversations" value={convRows.length} hint="Labelled separately from live calls" icon={Activity} />
        <Stat label="Awaiting review" value={convRows.filter((c) => c.status === "AWAITING_REVIEW").length} hint="Briefs a person must check" icon={KeyRound} />
        <Stat label="Opt-outs honoured" value={leadRows.filter((l) => l.status === "OPTED_OUT").length} hint={`${activity.n} audited actions this week · ${members.n} team members`} icon={ShieldCheck} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Demo walkthrough" description="The five-minute path for a lender meeting." />
        <ol className="grid gap-px bg-line sm:grid-cols-5">
          {[
            ["1", "Import leads", "Row-level checks and permission gate", "/leads/import"],
            ["2", "Simulate a call", "Hinglish, questions, opt-out", "/simulator"],
            ["3", "Inspect the brief", "Every field linked to evidence", "/conversations"],
            ["4", "Review & export", "Human decides, CSV out", "/conversations"],
            ["5", "Check quality", "Opt-outs and corrections", "/analytics"],
          ].map(([n, t, d, href]) => (
            <li key={n} className="bg-surface">
              <Link href={href} className="focus-ring group block h-full p-5 hover:bg-surface-2">
                <span className="font-mono text-xs text-ink-4">{n}</span>
                <p className="mt-1 text-sm font-semibold group-hover:underline">{t}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-3">{d}</p>
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Product boundaries"
            description="What this workspace is designed to do — and never does."
          />
          <div className="grid gap-px bg-line sm:grid-cols-2">
            <div className="bg-surface p-5">
              <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-ok">
                <ShieldCheck className="size-4" /> SVARA does
              </p>
              <ul className="space-y-2.5 text-[13px] leading-relaxed text-ink-2">
                {DOES.map((d) => (
                  <li key={d} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-4" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-surface p-5">
              <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-danger">
                <ShieldX className="size-4" /> SVARA does not
              </p>
              <ul className="space-y-2.5 text-[13px] leading-relaxed text-ink-2">
                {DOES_NOT.map((d) => (
                  <li key={d} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-4" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="What you can do" description={ROLE_LABELS[ctx.role]} />
          <ul className="flex flex-wrap gap-2 p-5">
            {perms.map((p) => (
              <li key={p}>
                <Badge>{PERMISSION_LABELS[p] ?? p}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {ctx.role === "ORG_ADMIN" && (
        <Card className="mt-6">
          <CardHeader
            title="Demo build status"
            description={`${doneCount} of ${MILESTONES.length} milestones complete. Visible to admins only.`}
          />
          <ol className="grid gap-x-6 gap-y-2.5 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {MILESTONES.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 text-[13px]">
                {m.done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-ok" />
                ) : (
                  <Circle className="size-4 shrink-0 text-ink-4" />
                )}
                <span className="font-mono text-xs text-ink-4">{m.id}</span>
                <span className={m.done ? "text-ink-2" : "text-ink-3"}>{m.title}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </>
  );
}
