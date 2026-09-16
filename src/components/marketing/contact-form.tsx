"use client";

import { CheckCircle2, Send } from "lucide-react";
import * as React from "react";

import { Button, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { CONTACT_TOPICS, type ContactInput } from "@aso/shared";
import { api } from "@/trpc/react";

export function ContactForm() {
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const formRef = React.useRef<HTMLFormElement>(null);

  const send = api.contact.send.useMutation({
    onSuccess: () => {
      setFieldErrors({});
      formRef.current?.reset();
    },
    onError: (error) => {
      // Field-level messages are far more useful than one banner saying the
      // form is invalid, so zod's per-field errors are surfaced where they
      // belong when the server sends them.
      const zod = error.data?.zodError?.fieldErrors as
        | Record<string, string[] | undefined>
        | undefined;

      setFieldErrors(
        zod
          ? Object.fromEntries(
              Object.entries(zod).flatMap(([field, messages]) =>
                messages?.[0] ? [[field, messages[0]] as const] : [],
              ),
            )
          : {},
      );
    },
  });

  if (send.isSuccess) {
    return (
      <div
        role="status"
        className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <CheckCircle2 className="size-5 text-[var(--status-good)]" aria-hidden />
        <h2 className="mt-3 text-base font-semibold">Message received</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {send.data.delivered
            ? "It has been sent on and someone will read it."
            : "It is saved. Email delivery is not configured on this deployment, so nobody has been notified automatically yet — worth knowing rather than assuming a reply is on the way."}
        </p>
        <Button className="mt-4" variant="secondary" size="sm" onClick={() => send.reset()}>
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setFieldErrors({});
        send.mutate({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          company: String(data.get("company") ?? "") || undefined,
          topic: String(data.get("topic") ?? "GENERAL") as ContactInput["topic"],
          message: String(data.get("message") ?? ""),
          website: String(data.get("website") ?? ""),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" error={fieldErrors.name}>
          <Input id="name" name="name" required autoComplete="name" />
        </Field>

        <Field label="Email" name="email" error={fieldErrors.email}>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company (optional)" name="company" error={fieldErrors.company}>
          <Input id="company" name="company" autoComplete="organization" />
        </Field>

        <Field label="Topic" name="topic" error={fieldErrors.topic}>
          <Select id="topic" name="topic" defaultValue="GENERAL">
            {CONTACT_TOPICS.map((topic) => (
              <option key={topic.value} value={topic.value}>
                {topic.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Message" name="message" error={fieldErrors.message}>
        <Textarea
          id="message"
          name="message"
          required
          rows={6}
          placeholder="What are you trying to measure, and what is getting in the way?"
        />
      </Field>

      {/* Honeypot. Hidden from sight and from screen readers, skipped by tab. */}
      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {send.isError && Object.keys(fieldErrors).length === 0 ? (
        <p role="alert" className="text-sm text-[var(--status-critical)]">
          {send.error.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={send.isPending}>
          {send.isPending ? "Sending…" : "Send message"} <Send />
        </Button>
        <p className="text-xs text-[var(--text-muted)]">
          We use your address to reply, and for nothing else.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-[var(--status-critical)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
