"use client";

import clsx from "clsx";
import {
  LayoutDashboard,
  LogOut,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/brand";
import { Avatar } from "@/components/ui";
import type { NavItem } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = { LayoutDashboard, Users, ScrollText };

export function Sidebar({
  items,
  orgName,
  userName,
  roleLabel,
}: {
  items: NavItem[];
  orgName: string;
  userName: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const sections: { key: NavItem["section"]; label: string }[] = [
    { key: "workspace", label: "Workspace" },
    { key: "admin", label: "Administration" },
  ];

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-5 pb-5 pt-5">
        <Logo />
        <div className="mt-5 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-4">Organisation</p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-ink" title={orgName}>
            {orgName}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3" aria-label="Main">
        {sections.map((section) => {
          const sectionItems = items.filter((i) => i.section === section.key);
          if (sectionItems.length === 0) return null;
          return (
            <div key={section.key}>
              <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-4">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {sectionItems.map((item) => {
                  const Icon = ICONS[item.icon] ?? LayoutDashboard;
                  const active =
                    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={clsx(
                          "focus-ring flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                          active
                            ? "bg-accent-soft font-medium text-accent"
                            : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar name={userName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{userName}</p>
            <p className="truncate text-[11px] text-ink-3">{roleLabel}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="focus-ring grid size-8 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
              aria-label="Sign out"
              title="Sign out / switch user"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
