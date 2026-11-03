import { Lock } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";

export default async function ForbiddenPage() {
  const { ctx } = await requireSession();
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <EmptyState
        icon={Lock}
        title="This area isn't available for your role"
        description={`You're signed in as ${ROLE_LABELS[ctx.role]}. Ask an Organisation Admin if you need access.`}
        action={<ButtonLink href="/">Back to overview</ButtonLink>}
      />
    </Card>
  );
}
