import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { organisations } from "@/db/schema";
import { requirePermission } from "@/lib/auth/session";
import { listLeads } from "@/lib/leads";
import { VoiceCall } from "./voice-call";

export const metadata: Metadata = { title: "Live call demo" };

export default async function CallPage() {
  const { ctx } = await requirePermission("simulator.run");
  const db = getDb();
  const [org] = await db.select().from(organisations).where(eq(organisations.id, ctx.organisationId));
  const callable = (await listLeads(db, ctx, { status: "CALLABLE" })).sort((a, b) => a.externalLeadId.localeCompare(b.externalLeadId));
  // English-preferring leads first, so the assistant opens in English by default.
  callable.sort((a, b) => Number(a.preferredLanguage === "Hindi") - Number(b.preferredLanguage === "Hindi"));

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Live call demo"
        description="The assistant calls you. Answer, then talk to it as the customer — in English or Hinglish. When the call ends, it becomes a brief in the review queue."
      />
      <VoiceCall
        lenderName={org.shortName}
        leads={callable.map((l) => ({ id: l.id, name: l.firstName ?? l.externalLeadId, externalId: l.externalLeadId, category: l.category, language: l.preferredLanguage }))}
      />
    </>
  );
}
