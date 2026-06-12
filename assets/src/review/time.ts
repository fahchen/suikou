const DATE_SAME_YEAR = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const DATE_WITH_YEAR = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const FULL = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/** Absolute timestamp in the viewer's locale and timezone, for hover tooltips. */
export function fullTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : FULL.format(date);
}

/** Compact age: "now", "5m", "3h"; past 24h falls back to a date ("Jun 9"). */
export function relativeTime(iso: string): string {
  const date = new Date(iso);
  const then = date.getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45) return "now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h`;
  const fmt = date.getFullYear() === new Date().getFullYear() ? DATE_SAME_YEAR : DATE_WITH_YEAR;
  return fmt.format(date);
}

/** Compact age that keeps counting in coarser units ("3d", "2w", "5mo", "1y"). */
export function elapsed(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.floor(day / 30);
  return mo < 12 ? `${mo}mo` : `${Math.floor(day / 365)}y`;
}
