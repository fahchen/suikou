import * as React from "react";

import { cn } from "@/lib/utils";

/** Auto-growing textarea (CSS `field-sizing`) carrying the review composer tokens. */
export const ComposerTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(function ComposerTextarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      data-slot="composer-textarea"
      className={cn(
        "field-sizing-content max-h-64 min-h-12 w-full overflow-y-auto rounded-lg border border-line bg-control px-2 py-1.5 text-[13px] focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25",
        className,
      )}
      {...props}
    />
  );
});
