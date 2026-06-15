/**
 * Shared motion primitives for review micro-interactions. Each helper takes the
 * caller's resolved `prefers-reduced-motion` state (via motion/react's
 * `useReducedMotion`) and returns inert props/keyframes when motion is reduced,
 * so the gate lives in one place instead of being re-derived at every call site.
 */

/** ease-out-quint — the project's standard confident deceleration curve. */
export const EASE_OUT_QUINT: [number, number, number, number] = [0.22, 1, 0.36, 1];

type PopProps = {
  initial: { opacity: number; scale: number };
  animate: { opacity: number; scale: number };
  transition: { duration: number; ease: [number, number, number, number] };
};

/**
 * Entrance pop for a state badge that appears in place (e.g. the Resolved chip
 * landing when a comment resolves). Empty object under reduced motion so the
 * badge simply exists with no transform.
 */
export function badgePop(reduced: boolean): PopProps | Record<string, never> {
  if (reduced) return {};
  return {
    initial: { opacity: 0, scale: 0.5 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.24, ease: EASE_OUT_QUINT },
  };
}

/**
 * Commit-acknowledgement keyframes for a control whose value just changed
 * (e.g. the verdict chip after a verdict is picked). `null` under reduced
 * motion so the caller skips the pulse entirely.
 */
export function commitPulse(reduced: boolean): { scale: number[] } | null {
  if (reduced) return null;
  return { scale: [1, 1.12, 1] };
}

export const COMMIT_PULSE_TRANSITION = {
  duration: 0.32,
  ease: EASE_OUT_QUINT,
} as const;
