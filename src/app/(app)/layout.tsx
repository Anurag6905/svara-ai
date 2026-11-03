import { FlaskConical } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { can, ROLE_LABELS } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";
import { NAV_ITEMS } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, organisation, ctx } = await requireSession();
  const items = NAV_ITEMS.filter((i) => !i.permission || can(ctx.role, i.permission));

  return (
    <div className="flex min-h-screen">
      <Sidebar
        items={items}
        orgName={organisation.name}
        userName={user.name}
        roleLabel={ROLE_LABELS[user.role]}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          role="status"
          className="flex items-center justify-center gap-2 border-b border-sim/20 bg-sim-soft px-4 py-1.5 text-xs text-sim"
        >
          <FlaskConical className="size-3.5" aria-hidden />
          <span>
            <strong className="font-semibold">Demo environment</strong> · synthetic data ·
            simulated conversations only · no live calls are placed
          </span>
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-10">{children}</main>
      </div>
    </div>
  );
}
