import { getSession } from "@/lib/auth/session";
import { csvTemplate } from "@/lib/leads";

export async function GET() {
  if (!(await getSession())) return new Response("Unauthorised", { status: 401 });
  return new Response(csvTemplate(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="svara-lead-import-template.csv"',
    },
  });
}
