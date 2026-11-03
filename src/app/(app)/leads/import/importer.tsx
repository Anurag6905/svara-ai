"use client";

import { AlertTriangle, CheckCircle2, FileUp, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { importLeadsAction, previewImportAction } from "@/app/actions/domain";
import { Badge, Button, ButtonLink, Card, CardHeader, Notice, Table, Td, Th } from "@/components/ui";

type Preview = NonNullable<Extract<Awaited<ReturnType<typeof previewImportAction>>, { ok: true }>["data"]>;

export function Importer() {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    setError(null);
    setDone(null);
    setPreview(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) return setError("Please choose a .csv file.");
    if (f.size > 1_000_000) return setError("File is larger than 1 MB.");
    const text = await f.text();
    setFile({ name: f.name, text });
    start(async () => {
      const r = await previewImportAction(text);
      if (r.ok && r.data) setPreview(r.data);
      else setError(r.message);
    });
  }

  function confirmImport() {
    if (!file) return;
    start(async () => {
      const r = await importLeadsAction(file.text, file.name);
      if (r.ok) {
        setDone(r.message);
        setPreview(null);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      } else setError(r.message);
    });
  }

  const errors = preview?.issues.filter((i) => i.kind === "error") ?? [];
  const dups = preview?.issues.filter((i) => i.kind === "duplicate") ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <label
          htmlFor="csv"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files[0]);
          }}
          className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line-strong px-6 py-12 text-center transition-colors hover:border-ink hover:bg-surface-2"
        >
          <span className="grid size-12 place-items-center rounded-xl bg-ink text-white">
            {pending ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
          </span>
          <span className="text-sm font-medium">{file ? file.name : "Drop a CSV here, or click to choose a file"}</span>
          <span className="text-xs text-ink-3">Up to 2,000 rows · 1 MB · synthetic or approved test data only</span>
          <input ref={inputRef} id="csv" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </Card>

      {error && <Notice tone="danger" icon={AlertTriangle}>{error}</Notice>}
      {done && (
        <Notice tone="ok" icon={CheckCircle2} title="Import complete">
          {done}{" "}
          <Link href="/leads" className="font-medium underline underline-offset-4">
            View leads
          </Link>
        </Notice>
      )}

      {preview && (
        <>
          {preview.headerErrors.length > 0 ? (
            <Notice tone="danger" icon={AlertTriangle} title="This file can't be imported">
              {preview.headerErrors.join(" ")}
            </Notice>
          ) : (
            <Card>
              <CardHeader
                title="Validation preview"
                description={`${preview.totalRows} rows checked. Nothing has been saved yet.`}
                action={
                  <Button variant="primary" onClick={confirmImport} disabled={pending || preview.validCount === 0}>
                    {pending && <Loader2 className="size-4 animate-spin" />}
                    Import {preview.validCount} valid row{preview.validCount === 1 ? "" : "s"}
                  </Button>
                }
              />
              <div className="grid gap-px bg-line sm:grid-cols-4">
                {[
                  ["Valid rows", preview.validCount, "text-ink"],
                  ["Ready for test", preview.readyCount, "text-ok"],
                  ["Need permission review", preview.validCount - preview.readyCount, "text-warn"],
                  ["Rejected or duplicate", errors.length + dups.length, "text-danger"],
                ].map(([label, n, c]) => (
                  <div key={label as string} className="bg-surface px-5 py-4">
                    <p className="text-xs text-ink-3">{label}</p>
                    <p className={`tabular mt-1 text-2xl font-semibold ${c}`}>{n}</p>
                  </div>
                ))}
              </div>

              {(errors.length > 0 || dups.length > 0) && (
                <>
                  <p className="border-t border-line px-5 pb-2 pt-4 text-[13px] font-medium">Rows that will be skipped</p>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Row</Th>
                        <Th>Lead ID</Th>
                        <Th>Type</Th>
                        <Th>Problem</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...errors, ...dups].sort((a, b) => a.row - b.row).map((i) => (
                        <tr key={`${i.kind}-${i.row}`}>
                          <Td className="tabular font-mono text-xs">{i.row}</Td>
                          <Td className="whitespace-nowrap font-mono text-xs">{i.leadId ?? "—"}</Td>
                          <Td>
                            <Badge tone={i.kind === "error" ? "danger" : "warn"}>{i.kind === "error" ? "Invalid" : "Duplicate"}</Badge>
                          </Td>
                          <Td className="text-ink-2">{i.messages.join("; ")}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}

              {preview.sample.some((s) => !s.ready) && (
                <>
                  <p className="flex items-center gap-2 border-t border-line px-5 pb-2 pt-4 text-[13px] font-medium">
                    <ShieldAlert className="size-4 text-warn" /> Valid rows that will be blocked from the simulator
                  </p>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Row</Th>
                        <Th>Lead ID</Th>
                        <Th>Why it&apos;s blocked</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.filter((s) => !s.ready).map((s) => (
                        <tr key={s.row}>
                          <Td className="tabular font-mono text-xs">{s.row}</Td>
                          <Td className="whitespace-nowrap font-mono text-xs">{s.leadId}</Td>
                          <Td className="text-ink-2">{s.reasons.join("; ")}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}
            </Card>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/api/leads/template" prefetch={false}>Download CSV template</ButtonLink>
        <ButtonLink href="/sample-leads-with-errors.csv" prefetch={false} variant="ghost">
          Sample file with errors (for demos)
        </ButtonLink>
      </div>
    </div>
  );
}
