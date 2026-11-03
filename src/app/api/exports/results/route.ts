import { getDb } from "@/db/client";
import { can } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import { exportResultsCsv } from "@/lib/exports";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorised", { status: 401 });
  if (!can(session.ctx.role, "exports.download")) return new Response("Forbidden", { status: 403 });
  const reviewedOnly = new URL(req.url).searchParams.get("scope") !== "all";
  const csv = await exportResultsCsv(getDb(), session.ctx, { reviewedOnly });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="svara-results-${reviewedOnly ? "reviewed" : "all"}-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
