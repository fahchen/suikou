import { CRITIQUE_META, type Comment } from "./types";

/** "all" includes resolved problems; "noteworthy" keeps only unresolved ones. */
export type CopyMode = "all" | "noteworthy";

/**
 * Writes text to the clipboard, returning whether it landed. Prefers the async
 * Clipboard API but falls back to a hidden-textarea `execCommand` copy, since
 * `navigator.clipboard` is undefined in insecure contexts (plain-HTTP LAN
 * origins). Never throws, so callers can copy-then-submit without the copy
 * aborting the submit.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function anchorLabel(comment: Comment): string {
  if (comment.anchor?.type !== "line_range") return "no anchor";
  const { start_line, end_line } = comment.anchor;
  return start_line === end_line ? `L${start_line}` : `L${start_line}–${end_line}`;
}

function quoteBlock(comment: Comment): string | null {
  if (comment.anchor?.type !== "line_range") return null;
  const { quote } = comment.anchor;
  return quote
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function problemBlock(comment: Comment, withReplies: boolean): string {
  const type = CRITIQUE_META[comment.critique_type].label;
  const parts = [`### [${type}] ${anchorLabel(comment)}`];
  const quote = quoteBlock(comment);
  if (quote) parts.push(quote);
  parts.push(comment.body);
  if (withReplies && comment.replies.length > 0) {
    parts.push("Replies:");
    parts.push(comment.replies.map((reply) => `- ${reply.author}: ${reply.body}`).join("\n"));
  }
  return parts.join("\n\n");
}

/** One file's comments, viewed at a given round, for the review-wide digest. */
export type CopyFile = { title: string; round: number; comments: Comment[] };

/**
 * Builds a paste-friendly markdown digest of the whole review's problems, one
 * section per file. Copy is always review-level regardless of view mode; files
 * with no problems for the chosen mode are omitted.
 */
export function buildReviewCopyText(reviewName: string, files: CopyFile[], mode: CopyMode): string {
  const sections = [`# Review: ${reviewName}`];

  for (const file of files) {
    const fileSection = fileBlock(file, mode);
    if (fileSection) sections.push(fileSection);
  }

  return sections.join("\n\n");
}

function fileBlock(file: CopyFile, mode: CopyMode): string | null {
  const unresolved = file.comments.filter((comment) => !comment.resolved);
  const resolved = file.comments.filter((comment) => comment.resolved);
  const include = mode === "all" ? file.comments.length > 0 : unresolved.length > 0;
  if (!include) return null;

  const parts = [`## ${file.title} — Round ${file.round}`];

  parts.push(
    [`**Unresolved (${unresolved.length})**`, ...unresolved.map((c) => problemBlock(c, true))].join(
      "\n\n",
    ),
  );

  if (mode === "all") {
    parts.push(
      [`**Resolved (${resolved.length})**`, ...resolved.map((c) => problemBlock(c, false))].join(
        "\n\n",
      ),
    );
  }

  return parts.join("\n\n");
}
