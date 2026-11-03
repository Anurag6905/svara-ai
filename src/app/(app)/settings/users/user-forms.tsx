"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  changeRoleAction,
  inviteUserAction,
  setActiveAction,
  type ActionResult,
} from "@/app/actions/users";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { ROLES, type Role } from "@/db/enums";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/rbac";

export function InviteUserForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    inviteUserAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState<Role>("AGENT");

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setRole("AGENT");
    }
  }, [state]);

  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <form ref={formRef} action={action} className="space-y-4 p-5" noValidate>
      <Field label="Full name" htmlFor="name" error={errors.name}>
        <input id="name" name="name" className={inputClass} placeholder="e.g. Meera Joshi" required />
      </Field>
      <Field label="Work email" htmlFor="email" error={errors.email}>
        <input
          id="email"
          name="email"
          type="email"
          className={inputClass}
          placeholder="name@lender.demo"
          required
        />
      </Field>
      <Field label="Job title" htmlFor="title" hint="Optional">
        <input id="title" name="title" className={inputClass} placeholder="e.g. Team Leader" />
      </Field>
      <Field label="Role" htmlFor="role" hint={ROLE_DESCRIPTIONS[role]} error={errors.role}>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className={inputClass}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </Field>

      {state && (
        <Notice tone={state.ok ? "ok" : "danger"}>{state.message}</Notice>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        Send invite
      </Button>
      <p className="text-xs leading-relaxed text-ink-4">
        In the demo no email is sent. Invited users appear on the sign-in screen and become
        active on first sign-in.
      </p>
    </form>
  );
}

export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: Role;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    changeRoleAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        defaultValue={role}
        disabled={disabled || pending}
        aria-label="Role"
        onChange={() => formRef.current?.requestSubmit()}
        className="focus-ring h-8 rounded-md border border-line-strong bg-surface-2 px-2 text-[13px] text-ink disabled:opacity-60"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="size-3.5 animate-spin text-ink-3" />}
      {state && !state.ok && <span className="text-xs text-danger">{state.message}</span>}
    </form>
  );
}

export function ActiveToggle({
  userId,
  userName,
  active,
}: {
  userId: string;
  userName: string;
  active: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    setActiveAction,
    null,
  );
  return (
    <form
      action={action}
      className="flex items-center justify-end gap-2"
      onSubmit={(e) => {
        if (active && !window.confirm(`Deactivate ${userName}? They will be signed out and unable to sign in.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      {state && !state.ok && <span className="text-xs text-danger">{state.message}</span>}
      <Button type="submit" size="sm" variant={active ? "ghost" : "secondary"} disabled={pending}>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {active ? "Deactivate" : "Reactivate"}
      </Button>
    </form>
  );
}
