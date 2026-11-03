import { Compass } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="This page doesn't exist, or it belongs to a feature that hasn't been built yet."
        action={<ButtonLink href="/">Go to overview</ButtonLink>}
      />
    </main>
  );
}
