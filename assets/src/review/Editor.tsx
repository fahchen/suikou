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
import { useFileScope } from "./file-scope";
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
  /** Rendered inside an outer card (stacked all-files mode): drop chrome so the
   * parent card frame isn't doubled. */
  nested?: boolean;
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
  tight: { section: "mt-6", hug: "mt-1", wide: "mt-3", prose: "mt-2" },
  normal: { section: "mt-8", hug: "mt-2", wide: "mt-5", prose: "mt-3" },
  loose: { section: "mt-11", hug: "mt-3", wide: "mt-7", prose: "mt-5" },
};

export const Editor = observer(function Editor(props: EditorProps) {
  if (props.imageSrc) return <ImageView src={props.imageSrc} nested={props.nested} />;
  if (props.contentError)
    return <FileNotice title="Can't load this file" message={props.contentError} nested={props.nested} />;
  if (isBinaryContent(props.content))
    return (
      <FileNotice
        title="Can't render this file"
        message="It looks like a binary file (an image or other non-text format), so there's no source to preview."
        nested={props.nested}
      />
    );
  if (props.view === "raw") return <RawView {...props} />;
  return <RenderView {...props} />;
});

const FileNotice = function FileNotice(props: { title: string; message: string; nested?: boolean }) {
  const chrome = props.nested
    ? "flex flex-col items-center gap-3 px-6 py-16 text-center"
    : "flex flex-col items-center gap-3 rounded-xl border border-line bg-editor px-6 py-16 text-center";
  return (
    <article className={chrome}>
      <FileX2 size={28} className="text-faint" aria-hidden />
      <div className="text-sm font-medium text-heading">{props.title}</div>
      <p className="max-w-sm text-[13px] text-muted-foreground">{props.message}</p>
    </article>
  );
};

const ImageView = function ImageView(props: { src: string; nested?: boolean }) {
  const name = decodeURIComponent(props.src.slice(props.src.lastIndexOf("/") + 1));
  const chrome = props.nested
    ? "flex justify-center px-2 py-6 sm:px-3"
    : "flex justify-center rounded-xl border border-line bg-editor px-2 py-6 sm:px-3";
  return (
    <article className={chrome}>
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
  const wrapperClass = props.nested
    ? "px-2 py-4 sm:px-3 sm:py-6"
    : "overflow-hidden rounded-xl border border-line bg-editor px-2 py-4 sm:px-3 sm:py-6";

  return (
    <article className={wrapperClass}>
      {props.inline &&
        unanchored.map((comment) => (
          <div key={comment.id} className="px-4 pt-3">
            <CommentCard comment={comment} context="inline" />
          </div>
        ))}

      {props.loading && <p className="px-6 py-8 text-sm text-muted-foreground">Rendering…</p>}

      {segmentBlocks(props.blocks).map((seg) =>
        seg.type === "code" ? (
          <CodeFence
            key={`code-${seg.blocks[0].startLine}`}
            blocks={seg.blocks}
            comments={props.comments}
            inline={props.inline}
            content={props.content}
            marginClass={blockSpacing(seg.blocks[0], props.blocks[seg.index - 1], tiers)}
          />
        ) : (
          <LineRow
            key={`${seg.block.startLine}-${seg.block.kind}`}
            startLine={seg.block.startLine}
            endLine={seg.block.endLine}
            comments={props.comments}
            inline={props.inline}
            content={props.content}
            marginClass={blockSpacing(seg.block, props.blocks[seg.index - 1], tiers)}
          >
            <div
              className={`min-w-0 flex-1 ${KIND_CLASS[seg.block.kind]}`}
              dangerouslySetInnerHTML={{ __html: seg.block.html }}
            />
          </LineRow>
        ),
      )}
    </article>
  );
});

type BlockSegment =
  | { type: "single"; block: RenderedBlock; index: number }
  | { type: "code"; blocks: RenderedBlock[]; index: number };

/**
 * Coalesces consecutive code-fence line blocks into one `code` segment so the
 * editor can wrap each fence in a single horizontal-scroll box, while every
 * other block stays its own `single` segment. The carried `index` is the
 * block's position in the original list so spacing can read its predecessor.
 */
function segmentBlocks(blocks: RenderedBlock[]): BlockSegment[] {
  const segments: BlockSegment[] = [];
  let i = 0;
  while (i < blocks.length) {
    if (blocks[i].kind === "code") {
      const start = i;
      const run: RenderedBlock[] = [];
      while (i < blocks.length && blocks[i].kind === "code") {
        run.push(blocks[i]);
        i++;
      }
      segments.push({ type: "code", blocks: run, index: start });
    } else {
      segments.push({ type: "single", block: blocks[i], index: i });
      i++;
    }
  }
  return segments;
}

/**
 * One fenced code block as a single horizontal-scroll box: a rounded, tinted
 * container scrolls all its lines together so they stay column-aligned, while
 * each line is still its own anchorable row (sticky line-number gutter + the
 * "+" add-comment button). The inner `w-max min-w-full` wrapper sizes every row
 * to the widest line so the shared right edge and tint span the full width.
 */
const CodeFence = observer(function CodeFence(props: {
  blocks: RenderedBlock[];
  comments: Comment[];
  inline: boolean;
  content: string;
  marginClass?: string;
}) {
  return (
    <div
      className={`${props.marginClass ?? ""} overflow-x-auto rounded-lg border border-line-soft bg-code py-2`}
    >
      <div className="w-max min-w-full">
        {props.blocks.map((block) => (
          <LineRow
            key={`${block.startLine}-code`}
            startLine={block.startLine}
            endLine={block.endLine}
            comments={props.comments}
            inline={props.inline}
            content={props.content}
            fill
            tone="code"
          >
            <span
              className="md-codeline min-w-0 flex-1 whitespace-pre pl-2 font-mono text-[0.86rem] leading-[1.6]"
              dangerouslySetInnerHTML={{ __html: block.html }}
            />
          </LineRow>
        ))}
      </div>
    </div>
  );
});

const RawView = observer(function RawView(props: EditorProps) {
  const lines = props.content.split("\n");
  const unanchored = props.comments.filter((c) => !c.anchor);
  const chrome = props.nested ? "" : "rounded-xl border border-line bg-editor";

  return (
    <article
      className={`${chrome} py-4 font-mono text-[13px] sm:py-6 ${
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
    b.kind === "code" || b.kind === "mermaid" || b.tag === "table" || b.tag === "tr";
  // Items of the same list hug like list rows, not separate reading blocks.
  if (block.tag === "li" && prev.tag === "li") return "mt-0.5";
  // Rows split out of one table stay flush so they read as a single grid.
  if (block.tag === "tr" && prev.tag === "tr") return "";
  // Lines split out of one code fence stay flush so they read as one block.
  if (block.kind === "code" && prev.kind === "code") return "";
  // Paragraphs split out of one blockquote stay flush so the quote bar reads
  // as one continuous block.
  if (block.tag === "blockquote" && prev.tag === "blockquote") return "";
  // Terms/definitions split out of one definition list hug like list rows.
  const defItem = (b: RenderedBlock) => b.tag === "dt" || b.tag === "dd";
  if (defItem(block) && defItem(prev)) return "mt-0.5";
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
  /** "code": the row sits inside a tinted code-fence box, so it stays
   * transparent (letting the box tint show) instead of painting its own bg. */
  tone?: "code";
  children: React.ReactNode;
}) {
  const ui = uiStore;
  const fileScope = useFileScope();
  const { startLine, endLine } = props;
  // Each file owns its draft, so reading by scope keeps a sibling stacked file's
  // open composer from rendering a phantom selection here on the same lines, and
  // restores this file's own draft when the user switches back to it.
  const draft = ui.draftFor(fileScope);
  const selStart = draft?.selStart ?? null;
  const selEnd = draft?.selEnd ?? null;
  const selected =
    selStart != null && selEnd != null && startLine <= selEnd && endLine >= selStart;
  const composerOpen = selStart != null && selEnd != null && endLine === selEnd;
  const label = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
  const inlineComments = props.inline
    ? props.comments.filter(
        (c) =>
          c.anchor?.type === "line_range" &&
          c.anchor.start_line >= startLine &&
          c.anchor.start_line <= endLine,
      )
    : [];

  return (
    <div className={`${props.marginClass ?? ""} ${props.fill ? "min-w-full" : ""}`}>
      <div
        className={`group flex items-start gap-2 px-2 sm:gap-3 sm:px-4 ${selected ? "bg-active-line" : props.tone === "code" ? "hover:bg-hover" : "bg-editor hover:bg-hover"}`}
        id={`line-${startLine}`}
        aria-selected={selected}
      >
        <button
          type="button"
          title={`Add a comment on line ${startLine} (Shift-click to extend)`}
          aria-label={`Add a comment on line ${startLine}`}
          className={`relative sticky left-0 z-10 w-12 shrink-0 cursor-pointer select-none self-stretch pr-2 text-right font-mono text-[12px] backdrop-blur-sm transition-colors ${
            selected
              ? "bg-active-line text-blue"
              : "bg-editor text-faint group-hover:bg-hover hover:text-blue"
          }`}
          onClick={(e) => {
            const extend = selStart != null && e.shiftKey;
            if (extend) {
              ui.extendSelection(startLine, endLine, fileScope);
            } else {
              ui.openComposer(startLine, endLine, "located", fileScope);
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
              filePath={fileScope}
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
