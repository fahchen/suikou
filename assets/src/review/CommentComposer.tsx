import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { CommentBody } from "./CommentBody";
import { ComposerTextarea } from "./ComposerTextarea";
import { Button } from "@/components/ui/button";

type Phase = "editing" | "submitting";

/**
 * One stateful editing unit shared by the new / reply / edit surfaces. It owns
 * the `editing → submitting → (success | rollback)` machine:
 *
 *   - `editing`: the textarea is shown (Cmd/Ctrl+Enter submits, Esc cancels).
 *   - `submitting`: the typed body is optimistically rendered as the saved
 *     comment would look (dimmed, with a "Saving…" hint) while the backend
 *     command is awaited.
 *   - success → `onSuccess` fires so the caller can clear/close and let the real
 *     comment from the snapshot take over.
 *   - failure → back to `editing` with the text intact plus a retryable error.
 *
 * Body is controlled so the new-comment surface can back it with the persisted
 * ui-store draft while reply/edit back it with local state.
 */
export function CommentComposer(props: {
  value: string;
  onChange: (value: string) => void;
  /** Resolves when the backend confirms; reject to roll back to `editing`. */
  onSubmit: (body: string) => Promise<unknown>;
  /** Confirmed: clear/close here so the snapshot's real comment takes over. */
  onSuccess?: () => void;
  onCancel?: () => void;
  submitLabel: string;
  /** Write gate (store not ready / command pending). Empty body is handled here. */
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  textareaClassName?: string;
  /** Render the ⌘⏎ hint inside the submit button. */
  submitKbd?: boolean;
  /** Action placed at the left of the submit row (e.g. resolve, type select). */
  leadingAction?: ReactNode;
}) {
  const {
    value,
    onChange,
    onSubmit,
    onSuccess,
    onCancel,
    submitLabel,
    disabled = false,
    placeholder,
    autoFocus,
    textareaClassName,
    submitKbd = false,
    leadingAction,
  } = props;
  const [phase, setPhase] = useState<Phase>("editing");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const body = value.trim();
    if (!body || disabled || phase === "submitting") return;
    setError(null);
    setPhase("submitting");
    try {
      await onSubmit(body);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      setPhase("editing");
    }
  }

  if (phase === "submitting") {
    return (
      <div className="flex flex-col gap-1.5" aria-busy="true">
        <div className="rounded-lg border border-line-soft bg-panel/60 px-2.5 py-1.5 opacity-70">
          <CommentBody body={value.trim()} />
        </div>
        <span className="flex items-center gap-1 text-[11px] text-faint">
          <Loader2 size={12} className="animate-spin" aria-hidden />
          Saving…
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-[12px] text-red">
          {error}
        </p>
      )}
      <ComposerTextarea
        autoFocus={autoFocus}
        className={textareaClassName}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onSubmit={submit}
        onCancel={onCancel}
      />
      <div className="flex items-center gap-2">
        {leadingAction}
        <div className="ml-auto flex items-center gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
          <Button type="button" size="sm" disabled={disabled || !value.trim()} onClick={submit}>
            {submitLabel}
            {submitKbd && (
              <kbd
                aria-hidden
                className="hidden rounded bg-on-accent/20 px-1 font-sans text-[10px] leading-4 sm:inline"
              >
                ⌘⏎
              </kbd>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
