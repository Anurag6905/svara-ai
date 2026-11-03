/**
 * Synthetic demo data. Every name, email and organisation here is fictional.
 * No real personal data may ever be added to seed files (PRD §16).
 */
import type { Role } from "./schema";

export const DEMO_ORGS = [
  {
    key: "primary",
    name: "Kaveri Capital Finance (Demo NBFC)",
    shortName: "Kaveri Capital",
    institutionType: "NBFC",
  },
  {
    // A second tenant exists so tenant isolation can be demonstrated and tested.
    key: "secondary",
    name: "Northbridge Bank (Demo)",
    shortName: "Northbridge Bank",
    institutionType: "Bank",
  },
] as const;

export type DemoOrgKey = (typeof DEMO_ORGS)[number]["key"];

export const DEMO_USERS: {
  org: DemoOrgKey;
  name: string;
  email: string;
  title: string;
  role: Role;
}[] = [
  {
    org: "primary",
    name: "Priya Nair",
    email: "priya.admin@kaveri.demo",
    title: "Head of Digital Lending",
    role: "ORG_ADMIN",
  },
  {
    org: "primary",
    name: "Rohan Mehta",
    email: "rohan.manager@kaveri.demo",
    title: "Lending Sales Manager",
    role: "MANAGER",
  },
  {
    org: "primary",
    name: "Ananya Kulkarni",
    email: "ananya.agent@kaveri.demo",
    title: "Relationship Executive",
    role: "AGENT",
  },
  {
    org: "primary",
    name: "Imran Shaikh",
    email: "imran.analyst@kaveri.demo",
    title: "Sales Operations Analyst",
    role: "ANALYST",
  },
  {
    org: "secondary",
    name: "Kavya Iyer",
    email: "kavya.admin@northbridge.demo",
    title: "Contact Centre Head",
    role: "ORG_ADMIN",
  },
];
