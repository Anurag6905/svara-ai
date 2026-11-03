import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// ───────────── Buttons ─────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonBase =
  "focus-ring inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-surface-2 hover:border-ink-4",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger:
    "border border-danger/40 bg-danger-soft text-danger hover:bg-danger/20",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
) {
  return clsx(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ───────────── Surfaces ─────────────

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={clsx("rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]", className)}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && (
          <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-ink-3">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-ink-3">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ───────────── Status ─────────────

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "sim";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink-2 ring-line-strong",
  accent: "bg-ink text-white ring-ink",
  ok: "bg-ok-soft text-ok ring-ok/30",
  warn: "bg-warn-soft text-warn ring-warn/30",
  danger: "bg-danger-soft text-danger ring-danger/30",
  sim: "bg-sim-soft text-sim ring-sim/30",
};

export function Badge({
  tone = "neutral",
  children,
  dot = false,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-3">{label}</p>
        {Icon && <Icon className="size-4 text-ink-4" aria-hidden />}
      </div>
      <p className="tabular mt-3 text-[28px] font-semibold leading-none tracking-tight text-ink">
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-ink-4">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface-2">
        <Icon className="size-5 text-ink-3" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-3">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = "accent",
  icon: Icon,
  title,
  children,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  title?: string;
  children: ReactNode;
}) {
  const border: Record<Tone, string> = {
    neutral: "border-line",
    accent: "border-accent/25",
    ok: "border-ok/25",
    warn: "border-warn/25",
    danger: "border-danger/25",
    sim: "border-sim/25",
  };
  const iconColor: Record<Tone, string> = {
    neutral: "text-ink-3",
    accent: "text-accent",
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
    sim: "text-sim",
  };
  return (
    <div
      className={clsx(
        "flex gap-3 rounded-xl border bg-surface px-4 py-3.5 text-[13px] leading-relaxed text-ink-2",
        border[tone],
      )}
    >
      {Icon && <Icon className={clsx("mt-0.5 size-4 shrink-0", iconColor[tone])} />}
      <div>
        {title && <p className="mb-0.5 font-medium text-ink">{title}</p>}
        {children}
      </div>
    </div>
  );
}

// ───────────── Tables ─────────────

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={clsx(
        "border-b border-line px-5 py-2.5 text-xs font-medium text-ink-3",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <td className={clsx("border-b border-line/70 px-5 py-3 align-middle", className)}>
      {children}
    </td>
  );
}

// ───────────── Forms ─────────────

export const inputClass =
  "focus-ring h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-4 hover:border-ink-4 focus:border-ink";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-ink-4">{hint}</p>
      )}
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={clsx(
        "grid shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-ink-2 ring-1 ring-line-strong",
        size === "sm" ? "size-7 text-[11px]" : "size-9 text-xs",
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}
