import { FileText, GitCompare } from "lucide-react";

export type ReviewKind = "file_selection" | "git_diff";

const KIND_META: Record<
  ReviewKind,
  { icon: typeof FileText; label: string; title: string; className: string }
> = {
  file_selection: {
    icon: FileText,
    label: "Files",
    title: "File selection review",
    className: "bg-kind-files-bg text-kind-files-fg ring-1 ring-inset ring-kind-files-ring",
  },
  git_diff: {
    icon: GitCompare,
    label: "Diff",
    title: "Git diff review",
    className: "bg-kind-diff-bg text-kind-diff-fg ring-1 ring-inset ring-kind-diff-ring",
  },
};

/** Compact monochrome kind chip shown next to a review's name in the launcher
 * and the review workspace top bar. Icon shape and label together carry the
 * distinction between file-selection and diff reviews. */
export function KindBadge({ kind }: { kind: ReviewKind }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.06em] ${meta.className}`}
      title={meta.title}
    >
      <Icon size={10} aria-hidden />
      {meta.label}
    </span>
  );
}
