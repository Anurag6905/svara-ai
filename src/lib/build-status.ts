/** Shown to admins on the overview so the founders can see demo readiness. */
export const MILESTONES: { id: string; title: string; done: boolean }[] = [
  { id: "M0", title: "Foundation & design system", done: true },
  { id: "M1", title: "Workspace, roles, tenant isolation, audit log", done: true },
  { id: "M2", title: "Leads, CSV import & permission gating", done: false },
  { id: "M3", title: "Product catalogue", done: false },
  { id: "M4", title: "Conversation simulator", done: false },
  { id: "M5", title: "Evidence-backed credit-need profile", done: false },
  { id: "M6", title: "Explainable product matching", done: false },
  { id: "M7", title: "Human review & CSV export", done: false },
  { id: "M8", title: "Analytics, test suite & demo script", done: false },
];
