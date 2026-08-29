import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Parse an ISO stamp, treating a missing timezone as UTC (the server emits
// naive UTC timestamps).
export function parseIso(iso: string): Date {
  return new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
}

// Scroll behaviour for programmatic jumps. Smooth shows the reader where the
// target sits relative to where they were; `prefers-reduced-motion` overrides
// it, which the CSS rule for `scroll-behavior` cannot do for this option.
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}
