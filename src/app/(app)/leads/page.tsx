import { Contact, Download, Search, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { approveReadyLeadsAction } from "@/app/actions/domain";
import { ActionButton } from "@/components/action-button";
import { GateBadge, LeadStatusBadge } from "@/components/domain";
import { ButtonLink, Card, EmptyState, inputClass, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { LEAD_STATUSES, type LeadStatus } from "@/db/enums";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { LEAD_STATUS_META, LOAN_CATEGORIES, listLeads, maskPhone, type LeadFilters } from "@/lib/leads";

export const metadata: Metadata = { title: "Leads" };

const PERMISSION_LABEL: Record<string, string> = {
  GRANTED: "Granted",
  PENDING: "Pending",
  MISSING: "Missing",
  REVOKED: "Revoked",
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; category?: string }>;
}) {
  const { ctx } = await requirePermission("leads.view");
  const sp = await searchParams;
  const filters: LeadFilters = {
    status: (sp.status && ([...LEAD_STATUSES, "BLOCKED", "CALLABLE"] as string[]).includes(sp.status) ? sp.status : undefined) as LeadFilters["status"],
    q: sp.q?.slice(0, 60) || undefined,
    category: sp.category && (LOAN_CATEGORIES as readonly string[]).includes(sp.category) ? sp.category : undefined,
  };
  const db = getDb();
  const [rows, all] = await Promise.all([listLeads(db, ctx, filters), listLeads(db, ctx)]);
  const callable = all.filter((l) => l.gate.allowed).length;
  const blocked = all.filter((l) => !l.gate.allowed && l.status !== "OPTED_OUT").length;
  const optedOut = all.filter((l) => l.status === "OPTED_OUT").length;
  const readyCount = all.filter((l) => l.status === "READY_FOR_TEST" && l.gate.allowed).length;
  const filtered = !!(filters.status || filters.q || filters.category);

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Leads"
        description="Lender-approved enquiries. A lead can only enter the simulator — or any future calling workflow — when its permission record is complete and it hasn't opted out."
        actions={
          <>
            {can(ctx.role, "exports.download") && (
              <a href="/api/exports/results?scope=all" className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2">
                <Download className="size-4" /> Export results
              </a>
            )}
            {can(ctx.role, "leads.import") && (
              <ButtonLink href="/leads/import" variant="primary">
                <Upload className="size-4" /> Import CSV
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total leads" value={all.length} hint="All synthetic" />
        <Stat label="Permissioned" value={callable} hint="Can enter the simulator" />
        <Stat label="Blocked by permission check" value={blocked} hint="Need permission review" />
        <Stat label="Opted out" value={optedOut} hint="Permanently suppressed" />
      </div>

      <Card className="mt-6">
        <form className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4" role="search">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, lead ID or source" className={`${inputClass} pl-9`} aria-label="Search leads" />
          </div>
          <select name="status" defaultValue={filters.status ?? ""} className={`${inputClass} w-auto`} aria-label="Status">
            <option value="">All statuses</option>
            <option value="CALLABLE">Permissioned only</option>
            <option value="BLOCKED">Blocked only</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_META[s as LeadStatus].label}
              </option>
            ))}
          </select>
          <select name="category" defaultValue={filters.category ?? ""} className={`${inputClass} w-auto`} aria-label="Category">
            <option value="">All categories</option>
            {LOAN_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button className="focus-ring h-10 rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-ink-2">Filter</button>
          {filtered && (
            <Link href="/leads" className="text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline">
              Clear
            </Link>
          )}
          {can(ctx.role, "leads.approve_pilot") && (
            <div className="ml-auto">
              <ActionButton
                action={approveReadyLeadsAction}
                size="sm"
                disabled={readyCount === 0}
                confirm={`Approve ${readyCount} permissioned lead(s) for a future pilot batch? This does not place any calls.`}
              >
                Approve {readyCount} ready for pilot
              </ActionButton>
            </div>
          )}
        </form>

        {rows.length === 0 ? (
          <EmptyState
            icon={Contact}
            title={filtered ? "No leads match these filters" : "No leads yet"}
            description={filtered ? "Try clearing a filter." : "Import a CSV of synthetic or approved test leads to get started."}
            action={!filtered && can(ctx.role, "leads.import") ? <ButtonLink href="/leads/import">Import CSV</ButtonLink> : undefined}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Lead</Th>
                <Th>Phone</Th>
                <Th>Category</Th>
                <Th>Source</Th>
                <Th>Permission</Th>
                <Th>Contact check</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="group hover:bg-surface-2">
                  <Td>
                    <Link href={`/leads/${l.id}`} className="focus-ring block rounded">
                      <span className="font-medium text-ink group-hover:underline">{l.firstName ?? "—"}</span>
                      <span className="block font-mono text-[11px] text-ink-4">{l.externalLeadId}</span>
                    </Link>
                  </Td>
                  <Td className="tabular whitespace-nowrap font-mono text-xs text-ink-3">{maskPhone(l.phoneNumber)}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{l.category ?? "—"}</Td>
                  <Td className="max-w-44 truncate text-ink-3">{l.source}</Td>
                  <Td className="text-ink-2">{PERMISSION_LABEL[l.permissionStatus]}</Td>
                  <Td>
                    <GateBadge gate={l.gate} status={l.status} />
                  </Td>
                  <Td>
                    <LeadStatusBadge status={l.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="px-5 py-3 text-xs text-ink-4">
          Showing {rows.length} of {all.length}. Phone numbers are masked everywhere in the demo.
        </p>
      </Card>
    </>
  );
}
