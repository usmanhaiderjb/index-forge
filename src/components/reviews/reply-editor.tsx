"use client";

import { Send, Sparkles, TriangleAlert, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { cn } from "@aso/shared";
import { Badge, Button, Input, Textarea } from "@/components/ui/primitives";
import { api } from "@/trpc/react";

/**
 * Composer for a public developer reply.
 *
 * Two properties are deliberate: the character limit is the store's real one
 * and is enforced before anything is sent, and publishing is a separate
 * confirmed action — drafting never publishes.
 */
export function ReplyEditor({
  reviewId,
  onPublished,
}: {
  reviewId: string;
  onPublished: () => void | Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [flagged, setFlagged] = React.useState<string | null>(null);

  const limitQuery = api.reviews.replyLimit.useQuery({ reviewId }, { enabled: open });
  const limit = limitQuery.data?.limit ?? 350;
  const canReply = limitQuery.data?.canReply ?? false;

  const draft = api.reviews.draftReply.useMutation({
    onSuccess: (result) => {
      setText(result.reply);
      setFlagged(
        result.needsHumanReview
          ? `This review needs a human answer — ${result.addressesIssue}`
          : null,
      );
      if (result.overLimit) {
        toast.warning(
          `The draft is ${result.charCount} characters, over the ${result.limit} limit. Trim it before publishing.`,
        );
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const publish = api.reviews.reply.useMutation({
    onSuccess: async () => {
      toast.success("Reply published to the store");
      setOpen(false);
      setConfirming(false);
      setText("");
      await onPublished();
    },
    onError: (error) => {
      setConfirming(false);
      toast.error(error.message);
    },
  });

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Send /> Reply
      </Button>
    );
  }

  const over = text.length > limit;
  const remaining = limit - text.length;

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-[var(--border-strong)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--text-secondary)]">
          Public reply — visible to everyone on the store listing
        </p>
        <Button variant="ghost" size="sm" aria-label="Cancel" onClick={() => setOpen(false)}>
          <X />
        </Button>
      </div>

      {limitQuery.data && !canReply ? (
        <p className="flex items-start gap-2 rounded-md border border-[var(--status-warning)] bg-[color-mix(in_oklab,var(--status-warning)_12%,transparent)] p-2.5 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {limitQuery.data.reason}
        </p>
      ) : null}

      {flagged ? (
        <p className="flex items-start gap-2 rounded-md border border-[var(--status-critical)] bg-[color-mix(in_oklab,var(--status-critical)_10%,transparent)] p-2.5 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {flagged}
        </p>
      ) : null}

      <Textarea
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setConfirming(false);
        }}
        placeholder="Answer the specific thing they raised…"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "tabular text-xs",
            over ? "text-[var(--status-critical)]" : "text-[var(--text-muted)]",
          )}
        >
          {text.length}/{limit}
          {over ? ` — ${Math.abs(remaining)} over the store's limit` : ""}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Optional steer for the draft"
            className="h-8 w-52 text-xs"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={draft.isPending}
            onClick={() =>
              draft.mutate({
                reviewId,
                instructions: instructions.trim() || undefined,
              })
            }
          >
            <Sparkles /> {draft.isPending ? "Drafting…" : "Draft"}
          </Button>

          {confirming ? (
            <>
              <Badge tone="warning">Publish publicly?</Badge>
              <Button
                variant="primary"
                size="sm"
                disabled={publish.isPending}
                onClick={() => publish.mutate({ reviewId, body: text })}
              >
                {publish.isPending ? "Publishing…" : "Yes, publish"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={!text.trim() || over || !canReply}
              onClick={() => setConfirming(true)}
            >
              <Send /> Publish
            </Button>
          )}
        </div>
      </div>

      {draft.data && !draft.data.needsHumanReview ? (
        <p className="text-xs text-[var(--text-muted)]">
          Draft tone: {draft.data.tone} · answers: {draft.data.addressesIssue}
        </p>
      ) : null}
    </div>
  );
}
