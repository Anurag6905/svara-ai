import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { Avatar, Badge, Card, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import type { UserStatus } from "@/db/enums";
import { can, ROLE_LABELS } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";
import { listUsers } from "@/lib/users";
import { ActiveToggle, InviteUserForm, RoleSelect } from "./user-forms";

export const metadata: Metadata = { title: "Users & roles" };

const STATUS_TONE: Record<UserStatus, "ok" | "warn" | "danger"> = {
  ACTIVE: "ok",
  INVITED: "warn",
  DEACTIVATED: "danger",
};
const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  DEACTIVATED: "Deactivated",
};

export default async function UsersPage() {
  const { ctx, organisation } = await requireSession();
  const canManage = can(ctx.role, "users.manage");
  const members = await listUsers(getDb(), ctx);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users & roles"
        description={`People with access to ${organisation.shortName}. Users only ever see their own organisation's records.`}
      />

      {!canManage && (
        <div className="mb-6">
          <Notice tone="neutral" icon={Lock}>
            You can view the team directory. Only an Organisation Admin can invite users or
            change roles.
          </Notice>
        </div>
      )}

      <div className={canManage ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" : ""}>
        <Card>
          <CardHeader title="Team" description={`${members.length} members`} />
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                {canManage && <Th className="text-right">Access</Th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.id === ctx.userId;
                return (
                  <tr key={m.id} className="hover:bg-surface-2/50">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium text-ink">
                            {m.name}
                            {isSelf && <span className="ml-1.5 text-xs font-normal text-ink-4">(you)</span>}
                          </p>
                          <p className="truncate text-xs text-ink-3">
                            {m.title ? `${m.title} · ` : ""}
                            {m.email}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {canManage && !isSelf ? (
                        <RoleSelect userId={m.id} role={m.role} disabled={m.status === "DEACTIVATED"} />
                      ) : (
                        <span className="text-ink-2">{ROLE_LABELS[m.role]}</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[m.status]} dot>
                        {STATUS_LABEL[m.status]}
                      </Badge>
                    </Td>
                    {canManage && (
                      <Td className="text-right">
                        {!isSelf && (
                          <ActiveToggle
                            userId={m.id}
                            userName={m.name}
                            active={m.status !== "DEACTIVATED"}
                          />
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        {canManage && (
          <Card>
            <CardHeader title="Invite a user" description="Every change is recorded in the audit log." />
            <InviteUserForm />
          </Card>
        )}
      </div>
    </>
  );
}
