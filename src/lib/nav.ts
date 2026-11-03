import type { Permission } from "@/lib/auth/rbac";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide icon name, resolved in the client sidebar
  permission?: Permission;
  section: "workspace" | "admin";
}

/** Only features that exist appear in navigation — every visible control must work. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: "LayoutDashboard", section: "workspace" },
  { href: "/leads", label: "Leads", icon: "Contact", permission: "leads.view", section: "workspace" },
  { href: "/call", label: "Live call demo", icon: "PhoneCall", permission: "simulator.run", section: "workspace" },
  { href: "/simulator", label: "Simulator", icon: "AudioLines", permission: "simulator.run", section: "workspace" },
  { href: "/conversations", label: "Review queue", icon: "Inbox", permission: "leads.view", section: "workspace" },
  { href: "/products", label: "Product catalogue", icon: "Package", permission: "products.view", section: "workspace" },
  { href: "/analytics", label: "Analytics", icon: "BarChart3", permission: "analytics.view", section: "workspace" },
  { href: "/settings/users", label: "Users & roles", icon: "Users", section: "admin" },
  { href: "/settings/audit", label: "Audit log", icon: "ScrollText", permission: "audit.view", section: "admin" },
];
