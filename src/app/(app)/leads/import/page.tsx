import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { CSV_HEADERS, REQUIRED_HEADERS } from "@/lib/leads";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Import leads" };

export default async function ImportPage() {
  await requirePermission("leads.import");
  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title="Import leads from CSV"
        description="Every row is validated before anything is saved. Rows missing permission metadata are imported as Needs review and cannot enter the simulator until fixed."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Importer />
        <aside className="rounded-xl border border-line bg-surface p-5 text-[13px]">
          <p className="font-medium">Columns</p>
          <ul className="mt-3 space-y-1.5 font-mono text-xs">
            {CSV_HEADERS.map((h) => (
              <li key={h} className="flex items-center justify-between gap-2">
                <span>{h}</span>
                {(REQUIRED_HEADERS as readonly string[]).includes(h) && <span className="font-sans text-[11px] text-ink-3">required</span>}
              </li>
            ))}
          </ul>
          <p className="mt-5 font-medium">A lead is permissioned only when</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
            <li>permission_status is GRANTED</li>
            <li>timestamp, source and evidence reference are all present</li>
            <li>do_not_call_status is CLEAR</li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            Duplicates (same lead ID or phone, in the file or already in the workspace) are skipped. Never upload real customer data to the demo.
          </p>
        </aside>
      </div>
    </>
  );
}
