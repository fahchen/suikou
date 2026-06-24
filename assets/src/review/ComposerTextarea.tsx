import * as React from "react";

import { cn } from "@/lib/utils";

export interface ComposerTextareaProps extends React.ComponentProps<"textarea"> {
  /** Cmd/Ctrl+Enter handler. Skipped while an IME composition is active. */
  onSubmit?: () => void;
  /** Escape handler. */
  onCancel?: () => void;
}

/** Auto-growing textarea (CSS `field-sizing`) carrying the review composer tokens. */
export const ComposerTextarea = React.forwardRef<HTMLTextAreaElement, ComposerTextareaProps>(
  function ComposerTextarea({ className, onSubmit, onCancel, onKeyDown, ...props }, ref) {
    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      onKeyDown?.(e);
      // Don't fire mid IME composition (e.g. selecting a Chinese candidate with Enter).
      if (e.defaultPrevented || e.nativeEvent.isComposing) return;
      if (onSubmit && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onSubmit();
      } else if (onCancel && e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }

    return (
      <textarea
        ref={ref}
        data-slot="composer-textarea"
        className={cn(
          "field-sizing-content max-h-64 min-h-12 w-full overflow-y-auto rounded-lg border border-line bg-control px-2 py-1.5 text-[13px] focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25",
          className,
        )}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  },
);
