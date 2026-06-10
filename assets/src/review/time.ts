const DATE_SAME_YEAR = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const DATE_WITH_YEAR = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

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
