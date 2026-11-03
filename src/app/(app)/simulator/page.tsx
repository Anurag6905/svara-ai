import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { organisations } from "@/db/schema";
import { requirePermission } from "@/lib/auth/session";
import { SCENARIOS } from "@/lib/conversation/scenarios";
import { listLeads } from "@/lib/leads";
import { Simulator } from "./simulator";

export const metadata: Metadata = { title: "Simulator" };

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const { ctx } = await requirePermission("simulator.run");
  const { lead } = await searchParams;
  const db = getDb();
  const [org] = await db.select().from(organisations).where(eq(organisations.id, ctx.organisationId));
  const callable = (await listLeads(db, ctx, { status: "CALLABLE" })).sort((a, b) => a.externalLeadId.localeCompare(b.externalLeadId));

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Conversation simulator"
        description="Rehearse how the assistant handles a lending enquiry. It discloses that it is automated, asks one question at a time, never quotes rates or approval, and stops the moment a customer opts out."
      />
      <Simulator
        leads={callable.map((l) => ({ id: l.id, name: l.firstName ?? l.externalLeadId, externalId: l.externalLeadId, category: l.category, language: l.preferredLanguage }))}
        scenarios={SCENARIOS}
        lenderName={org.shortName}
        initialLeadId={lead}
      />
    </>
  );
}
