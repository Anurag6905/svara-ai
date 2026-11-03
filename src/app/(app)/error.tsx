"use client";

import { AlertTriangle } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        description="The page couldn't load. No data was changed. Try again, and if it keeps happening, reset the demo database."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </Card>
  );
}
