import { asc, eq } from "drizzle-orm";
import { ArrowRight, FlaskConical, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signInAsDemoUser } from "@/app/actions/auth";
import { Logo } from "@/components/brand";
import { Avatar, Badge, Notice } from "@/components/ui";
import { getDb } from "@/db/client";
import { organisations, users } from "@/db/schema";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "That sign-in request was not valid. Choose a demo user below.",
  inactive: "That account is deactivated. An Organisation Admin can reactivate it.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;

  const db = getDb();
  const rows = await db
    .select({ user: users, org: organisations })
    .from(users)
    .innerJoin(organisations, eq(organisations.id, users.organisationId))
    .orderBy(asc(organisations.createdAt), asc(users.createdAt));

  const byOrg = new Map<string, { org: (typeof rows)[number]["org"]; members: (typeof rows)[number]["user"][] }>();
  for (const r of rows) {
    const entry = byOrg.get(r.org.id) ?? { org: r.org, members: [] };
    entry.members.push(r.user);
    byOrg.set(r.org.id, entry);
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 15%, rgb(45 212 232 / 0.12), transparent 45%)",
          }}
        />
        <Logo />
        <div className="relative max-w-md">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
            Credit-need intelligence
          </p>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.15] tracking-tight">
            From customer intent to a better-qualified lead.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-3">
            SVARA structures what a customer actually said about their credit need,
            links every field to the conversation, and hands your sales team a brief
            they can trust — with a human reviewing every suggestion.
          </p>
        </div>
        <ul className="relative space-y-2.5 text-[13px] text-ink-3">
          <li className="flex items-center gap-2.5">
            <ShieldCheck className="size-4 text-ok" /> Not an underwriting, scoring or
            approval system
          </li>
          <li className="flex items-center gap-2.5">
            <FlaskConical className="size-4 text-sim" /> Demo environment: synthetic
            data and simulated conversations only
          </li>
        </ul>
      </aside>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Sign in to the demo workspace</h2>
          <p className="mt-1.5 text-sm text-ink-3">
            Choose a demo user. Each role sees and can do different things.
          </p>

          {error && ERRORS[error] && (
            <div className="mt-5">
              <Notice tone="danger">{ERRORS[error]}</Notice>
            </div>
          )}

          {[...byOrg.values()].map(({ org, members }) => (
            <div key={org.id} className="mt-7">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[13px] font-medium text-ink-2">{org.name}</p>
                <Badge>{org.institutionType}</Badge>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {members.map((u) => (
                  <li key={u.id}>
                    <form action={signInAsDemoUser}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button
                        type="submit"
                        disabled={u.status === "DEACTIVATED"}
                        className="focus-ring group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Avatar name={u.name} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink">{u.name}</span>
                            <Badge tone={u.role === "ORG_ADMIN" ? "accent" : "neutral"}>
                              {ROLE_LABELS[u.role]}
                            </Badge>
                            {u.status === "DEACTIVATED" && <Badge tone="danger">Deactivated</Badge>}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-3">
                            {ROLE_DESCRIPTIONS[u.role]}
                          </span>
                        </span>
                        <ArrowRight className="size-4 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="mt-8 text-xs leading-relaxed text-ink-4">
            Demo sign-in has no passwords. A real deployment would use the lender&apos;s
            single sign-on. All people and organisations shown are fictional.
          </p>
        </div>
      </section>
    </main>
  );
}
