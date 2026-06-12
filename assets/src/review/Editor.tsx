import { observer } from "mobx-react-lite";
import { AnimatePresence } from "motion/react";
import { FileX2, Plus } from "lucide-react";
import type { ThemedToken } from "shiki";

import { uiStore } from "../stores/ui-store";
import type { DocView, Density } from "../stores/ui-store";
import type { RenderedBlock } from "../markdown/render";
import type { Comment } from "./types";
import { Composer } from "./Composer";
import { CommentCard } from "./CommentCard";
import { isBinaryContent } from "./file-type";

interface EditorProps {
  view: DocView;
  content: string;
  blocks: RenderedBlock[];
  loading: boolean;
  comments: Comment[];
  rawLines: ThemedToken[][] | null;
  inline: boolean;
  /** Asset URL when the artifact is a displayable image; renders it instead of source. */
  imageSrc?: string;
  /** Set when the source content couldn't be fetched (file deleted, moved, unreadable). */
  contentError?: string | null;
}

// Shiki encodes font style as a bitmask (1 italic, 2 bold, 4 underline).
function tokenStyle(token: ThemedToken): React.CSSProperties {
  const style: React.CSSProperties = { color: token.color };
  const fontStyle = token.fontStyle ?? 0;
  if (fontStyle & 1) style.fontStyle = "italic";
  if (fontStyle & 2) style.fontWeight = "bold";
  if (fontStyle & 4) style.textDecoration = "underline";
  return style;
}

const KIND_CLASS: Record<RenderedBlock["kind"], string> = {
  markdown: "md-content",
  code: "md-code",
  mermaid: "md-mermaid",
};

/**
 * Per-density reading-rhythm top-margins keyed by block role. Classes stay
 * static so Tailwind can see them.
 */
const DENSITY: Record<
  Density,
  { section: string; hug: string; wide: string; prose: string }
> = {
  tight: { section: "mt-5", hug: "mt-1", wide: "mt-3", prose: "mt-2" },
  normal: { section: "mt-7", hug: "mt-2", wide: "mt-5", prose: "mt-3" },
  loose: { section: "mt-10", hug: "mt-3", wide: "mt-7", prose: "mt-5" },
};

export const Editor = observer(function Editor(props: EditorProps) {
  if (props.imageSrc) return <ImageView src={props.imageSrc} />;
  if (props.contentError)
    return <FileNotice title="Can't load this file" message={props.contentError} />;
  if (isBinaryContent(props.content))
    return (
      <FileNotice
        title="Can't render this file"
        message="It looks like a binary file (an image or other non-text format), so there's no source to preview."
      />
    );
  if (props.view === "raw") return <RawView {...props} />;
  return <RenderView {...props} />;
});

const FileNotice = function FileNotice(props: { title: string; message: string }) {
  return (
    <article className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-editor px-6 py-16 text-center">
      <FileX2 size={28} className="text-faint" aria-hidden />
      <div className="text-sm font-medium text-heading">{props.title}</div>
      <p className="max-w-sm text-[13px] text-muted-foreground">{props.message}</p>
    </article>
  );
};

const ImageView = function ImageView(props: { src: string }) {
  const name = decodeURIComponent(props.src.slice(props.src.lastIndexOf("/") + 1));
  return (
    <article className="flex justify-center rounded-2xl border border-line bg-editor px-2 py-6 sm:px-3">
      <img
        src={props.src}
        alt={name}
        className="max-h-[80vh] max-w-full rounded-md object-contain"
      />
    </article>
  );
};

const RenderView = observer(function RenderView(props: EditorProps) {
  const unanchored = props.comments.filter((c) => !c.anchor);
  const tiers = DENSITY[uiStore.density];

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-editor px-2 py-4 sm:px-3 sm:py-6">
      {props.inline &&
        unanchored.map((comment) => (
          <div key={comment.id} className="px-4 pt-3">
            <CommentCard comment={comment} context="inline" />
          </div>
        ))}

      {props.loading && <p className="px-6 py-8 text-sm text-muted-foreground">Rendering…</p>}

      {props.blocks.map((block, i) => (
        <LineRow
          key={`${block.startLine}-${block.kind}`}
          startLine={block.startLine}
          endLine={block.endLine}
          comments={props.comments}
          inline={props.inline}
          content={props.content}
          marginClass={blockSpacing(block, props.blocks[i - 1], tiers)}
        >
          <div
            className={`min-w-0 flex-1 ${KIND_CLASS[block.kind]}`}
            dangerouslySetInnerHTML={{ __html: block.html }}
          />
        </LineRow>
      ))}
    </article>
  );
});

const RawView = observer(function RawView(props: EditorProps) {
  const lines = props.content.split("\n");
  const unanchored = props.comments.filter((c) => !c.anchor);

  return (
    <article
      className={`rounded-2xl border border-line bg-editor py-4 font-mono text-[13px] sm:py-6 ${
        // No left padding when scrolling: overflow-x clips to the padding box, so
        // a left pad would let scrolled text show in the strip beside the sticky
        // gutter. The w-12 gutter supplies the left gutter space itself.
        uiStore.wrapLines ? "overflow-hidden px-2 sm:px-3" : "overflow-x-auto pr-2 sm:pr-3"
      }`}
    >
      {props.inline &&
        unanchored.map((comment) => (
          <div key={comment.id} className="px-4 pt-3">
            <CommentCard comment={comment} context="inline" />
          </div>
        ))}

      <div className={uiStore.wrapLines ? undefined : "w-max min-w-full"}>
        {lines.map((line, i) => {
          const lineNo = i + 1;
          const tokens = props.rawLines?.[i];
          return (
            <LineRow
              key={i}
              startLine={lineNo}
              endLine={lineNo}
              comments={props.comments}
              inline={props.inline}
              content={props.content}
              fill={!uiStore.wrapLines}
            >
              <span
                className={`min-w-0 flex-1 pl-2 text-text ${
                  uiStore.wrapLines ? "whitespace-pre-wrap" : "whitespace-pre"
                }`}
              >
                {line === "" ? (
                  " "
                ) : tokens ? (
                  tokens.map((token, j) => (
                    <span key={j} style={tokenStyle(token)}>
                      {token.content}
                    </span>
                  ))
                ) : (
                  line
                )}
              </span>
            </LineRow>
          );
        })}
      </div>
    </article>
  );
});

/**
 * A single anchorable row: gutter line label + add-comment button, the content
 * slot supplied by the caller, plus the inline composer and anchored comments.
 * Shared by the rendered (per-block) and raw (per-line) views.
 */
/**
 * Reading-rhythm gap above each rendered block (margin-top only, so adjacent
 * flex rows never double their margins). Headings open a section, then hug the
 * body that follows; code/mermaid/tables get a wider break; prose stays calm.
 * Tier widths come from the active density.
 */
function blockSpacing(
  block: RenderedBlock,
  prev: RenderedBlock | undefined,
  tiers: (typeof DENSITY)[Density],
): string {
  if (!prev) return "";
  const heading = (b: RenderedBlock) => /^h[1-6]$/.test(b.tag);
  const wide = (b: RenderedBlock) =>
    b.kind === "code" || b.kind === "mermaid" || b.tag === "table";
  if (heading(block)) return tiers.section;
  if (heading(prev)) return tiers.hug;
  if (wide(block) || wide(prev)) return tiers.wide;
  return tiers.prose;
}

const LineRow = observer(function LineRow(props: {
  startLine: number;
  endLine: number;
  comments: Comment[];
  inline: boolean;
  content: string;
  marginClass?: string;
  fill?: boolean;
  children: React.ReactNode;
}) {
  const ui = uiStore;
  const { startLine, endLine } = props;
  const selStart = ui.selStart;
  const selEnd = ui.selEnd;
  const selected =
    selStart != null && selEnd != null && startLine <= selEnd && endLine >= selStart;
  const composerOpen = selStart != null && selEnd != null && endLine === selEnd;
  const label = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
  const inlineComments = props.inline
    ? props.comments.filter(
        (c) => c.anchor && c.anchor.start_line >= startLine && c.anchor.start_line <= endLine,
      )
    : [];

  return (
    <div className={`${props.marginClass ?? ""} ${props.fill ? "min-w-full" : ""}`}>
      <div
        className={`group flex items-start gap-2 px-2 sm:gap-3 sm:px-4 ${selected ? "bg-active-line" : "bg-editor hover:bg-hover"}`}
        id={`line-${startLine}`}
        aria-selected={selected}
      >
        <button
          type="button"
          title={`Add a comment on line ${startLine} (Shift-click to extend)`}
          aria-label={`Add a comment on line ${startLine}`}
          className={`relative sticky left-0 z-10 w-12 shrink-0 select-none self-stretch pr-2 text-right font-mono text-[12px] backdrop-blur-sm transition-colors ${
            selected
              ? "bg-active-line text-blue"
              : "bg-editor text-faint group-hover:bg-hover hover:text-blue"
          }`}
          onClick={(e) => {
            // Touch has no shift-key: once a range is open, a plain tap on any
            // other line number extends it. Fine pointers keep shift-to-extend.
            const extend =
              ui.selStart != null &&
              (e.shiftKey || window.matchMedia("(pointer: coarse)").matches);
            if (extend) {
              ui.extendSelection(startLine, endLine);
            } else {
              ui.openComposer(startLine, endLine, "line");
            }
          }}
        >
          <Plus
            size={13}
            className="absolute -left-2 top-0.5 hidden text-blue group-hover:block"
            aria-hidden
          />
          {label}
        </button>
        {props.children}
      </div>

      <AnimatePresence>
        {composerOpen && selStart != null && selEnd != null && (
          <div className={props.fill ? "sticky left-0 max-w-3xl" : undefined}>
            <Composer
              startLine={selStart}
              endLine={selEnd}
              selectedText={props.content.split("\n").slice(selStart - 1, selEnd).join("\n")}
            />
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {inlineComments.map((comment) => (
          <div
            key={comment.id}
            className={`px-2 pb-2 pt-2 pl-10 sm:px-4 sm:pl-14 ${props.fill ? "sticky left-0 max-w-3xl" : ""}`}
          >
            <CommentCard comment={comment} context="inline" />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
});
