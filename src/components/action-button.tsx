"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui";

type Result = { ok: boolean; message: string };

/** Button that runs a server action, shows its message, and refreshes the page. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "md",
  disabled,
}: {
  action: () => Promise<Result | void>;
  children: ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-end gap-1.5">
      <Button
        variant={variant}
        size={size}
        disabled={disabled || pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            if (r) setResult(r);
            router.refresh();
          });
        }}
      >
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {children}
      </Button>
      {result && (
        <span role="status" className={`max-w-xs text-right text-xs ${result.ok ? "text-ok" : "text-danger"}`}>
          {result.message}
        </span>
      )}
    </span>
  );
}
