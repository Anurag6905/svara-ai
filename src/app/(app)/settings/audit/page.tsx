import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { AUDIT_ACTION_LABELS, listAuditEvents } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Audit log" };

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Kolkata",
});

function describeMetadata(json: string): string {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    if ("from" in data && "to" in data) return `${data.from} → ${data.to}`;
    return Object.entries(data)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(" · ");
  } catch {
    return "";
  }
}

export default async function AuditPage() {
  const { ctx } = await requirePermission("audit.view");
  const events = await listAuditEvents(getDb(), ctx, { limit: 200 });

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Critical actions in this organisation, newest first. Phone numbers, transcript text and other sensitive values are redacted before they are written."
      />
      <Card>
        <CardHeader title="Recent activity" description={`Showing up to 200 events · times in IST`} />
        {events.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No activity yet"
            description="Sign-ins, user changes and — in later milestones — imports, simulations and reviews will appear here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-surface-2/50">
                  <Td className="tabular whitespace-nowrap text-ink-3">{dateFmt.format(e.timestamp)}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{e.actorName ?? "System"}</Td>
                  <Td>
                    <span className="text-ink">{AUDIT_ACTION_LABELS[e.action] ?? e.action}</span>
                    <span className="ml-2 font-mono text-[11px] text-ink-4">{e.action}</span>
                  </Td>
                  <Td>
                    <Badge>{e.entityType}</Badge>
                  </Td>
                  <Td className="max-w-xs truncate text-ink-3">{describeMetadata(e.metadataJson)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
