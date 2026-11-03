import clsx from "clsx";
import { Download, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { OUTCOMES, type Outcome } from "@/lib/conversation/engine";
import { listConversations } from "@/lib/conversations";

export const metadata: Metadata = { title: "Review queue" };

const dt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const OUTCOME_TONE: Record<Outcome, "ok" | "warn" | "danger" | "neutral"> = {
  INTERESTED_FOLLOW_UP: "ok",
  CALLBACK_REQUESTED: "ok",
  EXPLORING: "neutral",
  NOT_INTERESTED: "neutral",
  UNREACHABLE: "neutral",
  OPTED_OUT: "danger",
  HUMAN_REVIEW_REQUIRED: "warn",
};

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { ctx } = await requirePermission("leads.view");
  const { tab } = await searchParams;
  const active = tab === "reviewed" ? "REVIEWED" : tab === "all" ? undefined : "AWAITING_REVIEW";
  const db = getDb();
  const [rows, all] = await Promise.all([listConversations(db, ctx, active ? { status: active } : {}), listConversations(db, ctx)]);
  const counts = {
    pending: all.filter((c) => c.status === "AWAITING_REVIEW").length,
    reviewed: all.filter((c) => c.status === "REVIEWED").length,
  };
  const tabs = [
    { key: undefined, label: "Awaiting review", n: counts.pending },
    { key: "reviewed", label: "Reviewed", n: counts.reviewed },
    { key: "all", label: "All", n: all.length },
  ];
  const current = tab === "reviewed" ? "reviewed" : tab === "all" ? "all" : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Review queue"
        description="Every simulated conversation produces a brief that a person checks before it reaches the sales team."
        actions={
          <>
            {can(ctx.role, "exports.download") && (
              <a href="/api/exports/results" className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2">
                <Download className="size-4" /> Export reviewed (CSV)
              </a>
            )}
            {can(ctx.role, "simulator.run") && <ButtonLink href="/simulator" variant="primary">New simulation</ButtonLink>}
          </>
        }
      />
      <Card>
        <nav className="flex gap-1 border-b border-line px-3 pt-2" aria-label="Queue filter">
          {tabs.map((t) => (
            <Link
              key={t.label}
              href={t.key ? `/conversations?tab=${t.key}` : "/conversations"}
              className={clsx("-mb-px border-b-2 px-3 pb-2.5 pt-1.5 text-[13px] font-medium", current === t.key ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}
            >
              {t.label} <span className="ml-1 tabular text-ink-4">{t.n}</span>
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <EmptyState icon={Inbox} title="Nothing here" description={current ? "No conversations in this view yet." : "The queue is clear. Run a simulation to add one."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Stated purpose</Th>
                <Th>Amount</Th>
                <Th>AI outcome</Th>
                <Th>Mode</Th>
                <Th>When</Th>
                <Th>Review</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="group hover:bg-surface-2">
                  <Td>
                    <Link href={`/conversations/${c.id}`} className="font-medium group-hover:underline">{c.leadName ?? c.leadExternalId}</Link>
                    <span className="block font-mono text-[11px] text-ink-4">{c.leadExternalId}</span>
                  </Td>
                  <Td className="max-w-52 text-ink-2">{c.purpose ?? <span className="italic text-ink-4">Unknown</span>}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{c.amount ?? <span className="italic text-ink-4">Unknown</span>}</Td>
                  <Td>{c.outcome && <Badge tone={OUTCOME_TONE[c.outcome as Outcome]}>{OUTCOMES[c.outcome as Outcome]}</Badge>}</Td>
                  <Td><Badge tone="sim">Simulation</Badge></Td>
                  <Td className="tabular whitespace-nowrap text-ink-3">{dt.format(c.startedAt)}</Td>
                  <Td><Badge tone={c.status === "REVIEWED" ? "ok" : "warn"} dot>{c.status === "REVIEWED" ? "Reviewed" : "Awaiting"}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
