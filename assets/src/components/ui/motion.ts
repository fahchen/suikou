// Shared open/close transitions for the Base UI popups. Base UI marks the
// surface with `data-starting-style` as it enters and `data-ending-style` as it
// leaves, holding the element mounted until the CSS transition finishes, and
// exposes `--transform-origin` so the surface scales from its anchored edge (it
// falls back to the element centre when unset, e.g. the modal dialog).

/** Fade + subtle scale for anchored popups (popover, menu, select, combobox, tooltip, dialog card). */
export const POPUP_MOTION =
  "origin-[var(--transform-origin)] transition-[opacity,scale] duration-150 ease-out " +
  "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 " +
  "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:duration-100"

/** Fade for the modal backdrop. */
export const BACKDROP_MOTION =
  "transition-opacity duration-150 ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"

/** The modal dialog: on phones the bottom sheet rides in from the bottom edge
 * the way a native sheet does — travel, no fade; from `sm` the centred card
 * fades and scales instead. The slide is scoped to `max-sm` so it never fights
 * the card's `-translate-y-1/2` centring, and the scale to `sm` because the
 * `scale` property is independent of that centring. */
export const DIALOG_MOTION =
  "transition-[opacity,scale,translate] duration-200 ease-out data-[ending-style]:duration-150 " +
  "sm:origin-center " +
  "sm:data-[starting-style]:scale-95 sm:data-[starting-style]:opacity-0 " +
  "sm:data-[ending-style]:scale-95 sm:data-[ending-style]:opacity-0 " +
  "max-sm:duration-300 max-sm:ease-out-expo max-sm:data-[ending-style]:duration-200 " +
  "max-sm:data-[starting-style]:translate-y-full max-sm:data-[ending-style]:translate-y-full"
