import type { Permission } from "@/lib/auth/rbac";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide icon name, resolved in the client sidebar
  permission?: Permission;
  section: "workspace" | "admin";
}

/**
 * Only features that exist appear in navigation — every visible control must
 * work (PRD §10). Later milestones append items here.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: "LayoutDashboard", section: "workspace" },
  {
    href: "/settings/users",
    label: "Users & roles",
    icon: "Users",
    section: "admin",
  },
  {
    href: "/settings/audit",
    label: "Audit log",
    icon: "ScrollText",
    permission: "audit.view",
    section: "admin",
  },
];
