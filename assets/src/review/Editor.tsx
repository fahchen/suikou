import { Fragment, useState } from "react";
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

/**
 * Inline comment / composer wrapper. Pins to the left so the card stays put
 * while a wide code fence or table scrolls horizontally, and clamps its width to
 * the readable max on desktop but the viewport on a phone, so the card never
 * forces the page to scroll sideways. The viewport branch subtracts the page's
 * `px-3` (1.5rem) side padding.
 */
const COMMENT_CLAMP = "sticky left-0 w-full max-w-[min(48rem,calc(100vw_-_1.5rem))]";

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
          <div key={comment.id} className={`${COMMENT_CLAMP} px-4 pt-3`}>
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
        ) : seg.type === "table" ? (
          <TableBlock
            key={`table-${seg.blocks[0].startLine}`}
            rows={seg.blocks}
            comments={props.comments}
            inline={props.inline}
            content={props.content}
            marginClass={blockSpacing(seg.blocks[0], props.blocks[seg.index - 1], tiers)}
          />
        ) : (
          <BlockRow
            key={`${seg.block.startLine}-${seg.block.kind}`}
            startLine={seg.block.startLine}
            endLine={seg.block.endLine}
            kind={seg.block.kind}
            html={seg.block.html}
            comments={props.comments}
            inline={props.inline}
            content={props.content}
            marginClass={blockSpacing(seg.block, props.blocks[seg.index - 1], tiers)}
          />
        ),
      )}
    </article>
  );
});

type BlockSegment =
  | { type: "single"; block: RenderedBlock; index: number }
  | { type: "code"; blocks: RenderedBlock[]; index: number }
  | { type: "table"; blocks: RenderedBlock[]; index: number };

/**
 * Coalesces consecutive code-fence lines into one `code` segment and consecutive
 * table rows into one `table` segment, so the editor can wrap each in a single
 * horizontal-scroll unit; every other block stays its own `single` segment. The
 * carried `index` is the run's position in the original list so spacing can read
 * its predecessor.
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
    } else if (blocks[i].tag === "tr") {
      const start = i;
      const run: RenderedBlock[] = [];
      while (i < blocks.length && blocks[i].tag === "tr") {
        run.push(blocks[i]);
        i++;
      }
      segments.push({ type: "table", blocks: run, index: start });
    } else {
      segments.push({ type: "single", block: blocks[i], index: i });
      i++;
    }
  }
  return segments;
}

// --- Shared gutter pieces (one Editor view family: rendered markdown + raw
// source). Every gutter-bearing layout here is its own component with its own
// markup; they share only these leaf pieces and the `.gutter-cell` CSS look, not
// a branchy layout component. ---

/** One line-number button painted with the shared `.gutter-cell` look. Delegated
 * scrollers (code/raw runs) omit `onClick` and handle the click on the column
 * wrapper via `data-line`; in-place rows pass a handler directly. */
function GutterCell(props: {
  startLine: number;
  endLine: number;
  selected: boolean;
  hovered?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const label =
    props.startLine === props.endLine ? `${props.startLine}` : `${props.startLine}-${props.endLine}`;
  return (
    <button
      type="button"
      data-line={props.startLine}
      data-selected={props.selected ? "true" : undefined}
      data-hover={props.hovered ? "true" : undefined}
      title={`Add a comment on line ${props.startLine} (Shift-click to extend)`}
      aria-label={`Add a comment on line ${props.startLine}`}
      className={`gutter-cell ${props.className ?? ""}`}
      onClick={props.onClick}
    >
      <Plus size={12} className="gutter-plus" aria-hidden />
      {label}
    </button>
  );
}

/** The full-width aside stack under a row: the open composer and any anchored
 * inline comments for `[startLine, endLine]`. Pinned left so it stays readable
 * while a sibling code fence / table scrolls horizontally. */
const RowAside = observer(function RowAside(props: {
  startLine: number;
  endLine: number;
  comments: Comment[];
  inline: boolean;
  content: string;
  fileScope: string | null;
}) {
  const draft = uiStore.draftFor(props.fileScope);
  const selStart = draft?.selStart ?? null;
  const selEnd = draft?.selEnd ?? null;
  const composerOpen = selStart != null && selEnd != null && props.endLine === selEnd;
  const inlineComments = props.inline
    ? props.comments.filter(
        (c) =>
          c.anchor?.type === "line_range" &&
          c.anchor.start_line >= props.startLine &&
          c.anchor.start_line <= props.endLine,
      )
    : [];

  return (
    <>
      <AnimatePresence>
        {composerOpen && selStart != null && selEnd != null && (
          <div className={COMMENT_CLAMP}>
            <Composer
              startLine={selStart}
              endLine={selEnd}
              selectedText={props.content.split("\n").slice(selStart - 1, selEnd).join("\n")}
              filePath={props.fileScope}
            />
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {inlineComments.map((comment) => (
          <div
            key={comment.id}
            className={`${COMMENT_CLAMP} px-2 pb-2 pt-2 pl-10 sm:px-4 sm:pl-14`}
          >
            <CommentCard comment={comment} context="inline" />
          </div>
        ))}
      </AnimatePresence>
    </>
  );
});

/**
 * One rendered markdown block (paragraph, heading, list item, blockquote,
 * mermaid, footnote…): a two-column grid of `[gutter | content]`. The gutter is
 * a real grid column, never `position: sticky`, so it can't drift; the content
 * wraps and never scrolls horizontally. Gutter and content share one grid
 * element, so the `.md-row` hover lights the gutter with plain CSS.
 */
const BlockRow = observer(function BlockRow(props: {
  startLine: number;
  endLine: number;
  kind: RenderedBlock["kind"];
  html: string;
  marginClass?: string;
  comments: Comment[];
  inline: boolean;
  content: string;
}) {
  const ui = uiStore;
  const fileScope = useFileScope();
  const { startLine, endLine } = props;
  const draft = ui.draftFor(fileScope);
  const selStart = draft?.selStart ?? null;
  const selEnd = draft?.selEnd ?? null;
  const selected =
    selStart != null && selEnd != null && startLine <= selEnd && endLine >= selStart;

  return (
    <div className={props.marginClass ?? ""}>
      <div
        className={`md-row grid grid-cols-[var(--gutter-w)_minmax(0,1fr)] ${props.kind === "mermaid" ? "items-start" : "items-baseline"} ${selected ? "bg-active-line" : "hover:bg-hover"}`}
        id={`line-${startLine}`}
        aria-selected={selected}
      >
        <GutterCell
          startLine={startLine}
          endLine={endLine}
          selected={selected}
          onClick={(e) => {
            const extend = selStart != null && e.shiftKey;
            if (extend) ui.extendSelection(startLine, endLine, fileScope);
            else ui.openComposer(startLine, endLine, "located", fileScope);
          }}
        />
        <div
          className={`min-w-0 ${KIND_CLASS[props.kind]}`}
          dangerouslySetInnerHTML={{ __html: props.html }}
        />
      </div>

      <RowAside
        startLine={startLine}
        endLine={endLine}
        comments={props.comments}
        inline={props.inline}
        content={props.content}
        fileScope={fileScope}
      />
    </div>
  );
});

interface LineLike {
  startLine: number;
  endLine: number;
}

type RunItem<T extends LineLike> =
  | { type: "run"; lines: T[] }
  | { type: "aside"; line: T };

/** True when a line needs a full-width aside under it: its composer is open, or
 * it carries an inline comment. */
function lineHasAside(
  line: LineLike,
  selEnd: number | null,
  comments: Comment[],
  inline: boolean,
): boolean {
  if (selEnd != null && line.endLine === selEnd) return true;
  if (!inline) return false;
  return comments.some(
    (c) =>
      c.anchor?.type === "line_range" &&
      c.anchor.start_line >= line.startLine &&
      c.anchor.start_line <= line.endLine,
  );
}

/**
 * Split a list of lines into horizontal-scroll runs separated by asides. A run is
 * one scroll unit whose lines scroll together; a line that needs an aside ends
 * its run (it stays in the run, styled in place) and the aside follows full
 * width. With nothing open the whole list is a single run, so it scrolls as one
 * block; an open composer or inline comment splits it only at that line.
 */
function splitRuns<T extends LineLike>(
  lines: T[],
  hasAside: (line: T) => boolean,
): RunItem<T>[] {
  const items: RunItem<T>[] = [];
  let run: T[] = [];
  for (const line of lines) {
    run.push(line);
    if (hasAside(line)) {
      items.push({ type: "run", lines: run });
      run = [];
      items.push({ type: "aside", line });
    }
  }
  if (run.length) items.push({ type: "run", lines: run });
  return items;
}

/**
 * One fenced code block. The gutter is a fixed-width column that sits OUTSIDE the
 * horizontal scroller (no `position: sticky`, so it can't drift), beside a single
 * scroller that holds every code line so they scroll together and stay
 * column-aligned. Gutter cells and code lines share one fixed line height, so the
 * line numbers line up by construction. An open composer / inline comment splits
 * the fence into separate scroll runs at that line, with the aside between.
 */
const CodeFence = observer(function CodeFence(props: {
  blocks: RenderedBlock[];
  comments: Comment[];
  inline: boolean;
  content: string;
  marginClass?: string;
}) {
  const ui = uiStore;
  const fileScope = useFileScope();
  const draft = ui.draftFor(fileScope);
  const selStart = draft?.selStart ?? null;
  const selEnd = draft?.selEnd ?? null;

  const onLineClick = (line: number, shift: boolean) => {
    if (selStart != null && shift) ui.extendSelection(line, line, fileScope);
    else ui.openComposer(line, line, "located", fileScope);
  };

  const items = splitRuns(props.blocks, (b) =>
    lineHasAside(b, selEnd, props.comments, props.inline),
  );

  return (
    <div className={`${props.marginClass ?? ""} py-2`}>
      {items.map((item, i) =>
        item.type === "aside" ? (
          <RowAside
            key={`aside-${item.line.startLine}`}
            startLine={item.line.startLine}
            endLine={item.line.endLine}
            comments={props.comments}
            inline={props.inline}
            content={props.content}
            fileScope={fileScope}
          />
        ) : (
          <CodeRun
            key={`run-${i}-${item.lines[0].startLine}`}
            lines={item.lines}
            selStart={selStart}
            selEnd={selEnd}
            onLineClick={onLineClick}
          />
        ),
      )}
    </div>
  );
});

/** One contiguous scroll unit of code lines: gutter column beside one horizontal
 * scroller. Cross-column hover is driven from JS (the two columns are separate
 * DOM subtrees, so CSS `:hover` can't bridge them). */
function CodeRun(props: {
  lines: RenderedBlock[];
  selStart: number | null;
  selEnd: number | null;
  onLineClick: (line: number, shift: boolean) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const lineAt = (target: EventTarget | null): number | null => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-line]");
    return el ? Number(el.dataset.line) : null;
  };
  const selected = (line: number) =>
    props.selStart != null && props.selEnd != null && line >= props.selStart && line <= props.selEnd;

  return (
    <div
      className="flex"
      onPointerMove={(e) => {
        const ln = lineAt(e.target);
        setHovered((prev) => (prev === ln ? prev : ln));
      }}
      onPointerLeave={() => setHovered(null)}
      onClick={(e) => {
        const ln = lineAt(e.target);
        if (ln != null) props.onLineClick(ln, e.shiftKey);
      }}
    >
      <div className="flex shrink-0 flex-col">
        {props.lines.map((b) => (
          <GutterCell
            key={`g-${b.startLine}`}
            startLine={b.startLine}
            endLine={b.endLine}
            selected={selected(b.startLine)}
            hovered={hovered === b.startLine}
            className="h-[1.376rem] items-center"
            onClick={(e) => {
              e.stopPropagation();
              props.onLineClick(b.startLine, e.shiftKey);
            }}
          />
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="w-max min-w-full">
          {props.lines.map((b) => {
            const sel = selected(b.startLine);
            return (
              <div
                key={`c-${b.startLine}`}
                data-line={b.startLine}
                id={`line-${b.startLine}`}
                aria-selected={sel}
                className={`h-[1.376rem] ${sel ? "bg-active-line" : hovered === b.startLine ? "bg-hover" : ""}`}
              >
                <span
                  className="md-codeline block whitespace-pre bg-code pl-2 font-mono text-[0.86rem] leading-[1.376rem]"
                  dangerouslySetInnerHTML={{ __html: b.html }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** colSpan large enough to span every column; browsers clamp it to the table's
 * real column count, so an aside row stretches the full table width. */
const FULL_ROW_SPAN = 1000;

/** lucide "plus" glyph, inlined so the table gutter can live in raw cell HTML. */
const PLUS_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';

/**
 * One markdown table as a single horizontally-scrollable real `<table>`: columns
 * size to their content (no equal-width squeeze) and stay aligned across rows,
 * and the whole table scrolls as one unit when wider than the view. A single
 * table is one scroll container, so its line-number gutter is the row's leftmost
 * `<td>` pinned with `position: sticky; left: 0` — the one place sticky is right,
 * since the gutter is the leftmost cell with nothing before it, so it holds
 * drift-free. Clicks are delegated from the table so the gutter can live in raw
 * cell HTML. Composer and inline comments render as full-width aside rows pinned
 * left so they stay readable while the grid scrolls.
 */
const TableBlock = observer(function TableBlock(props: {
  rows: RenderedBlock[];
  comments: Comment[];
  inline: boolean;
  content: string;
  marginClass?: string;
}) {
  const ui = uiStore;
  const fileScope = useFileScope();
  const draft = ui.draftFor(fileScope);
  const selStart = draft?.selStart ?? null;
  const selEnd = draft?.selEnd ?? null;

  const onGutterClick = (e: React.MouseEvent<HTMLTableElement>) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-line-start]");
    if (!cell) return;
    const start = Number(cell.dataset.lineStart);
    const end = Number(cell.dataset.lineEnd);
    if (selStart != null && e.shiftKey) {
      ui.extendSelection(start, end, fileScope);
    } else {
      ui.openComposer(start, end, "located", fileScope);
    }
  };

  return (
    <div className={`${props.marginClass ?? ""} overflow-x-auto bg-editor`}>
      <table className="md-table w-max min-w-full" onClick={onGutterClick}>
        <tbody>
          {props.rows.map((row) => {
            const { startLine, endLine } = row;
            const selected =
              selStart != null && selEnd != null && startLine <= selEnd && endLine >= selStart;
            const composerOpen = selStart != null && selEnd != null && endLine === selEnd;
            const inlineComments = props.inline
              ? props.comments.filter(
                  (c) =>
                    c.anchor?.type === "line_range" &&
                    c.anchor.start_line >= startLine &&
                    c.anchor.start_line <= endLine,
                )
              : [];

            return (
              <Fragment key={`${startLine}-tr`}>
                <TableRow startLine={startLine} endLine={endLine} cells={row.html} selected={selected} />

                {composerOpen && selStart != null && selEnd != null && (
                  <tr>
                    <td colSpan={FULL_ROW_SPAN} className="md-table-aside">
                      <div className={COMMENT_CLAMP}>
                        <Composer
                          startLine={selStart}
                          endLine={selEnd}
                          selectedText={props.content.split("\n").slice(selStart - 1, selEnd).join("\n")}
                          filePath={fileScope}
                        />
                      </div>
                    </td>
                  </tr>
                )}

                {inlineComments.map((comment) => (
                  <tr key={comment.id}>
                    <td colSpan={FULL_ROW_SPAN} className="md-table-aside">
                      <div className={`${COMMENT_CLAMP} px-2 pb-2 pt-2 pl-10 sm:px-4 sm:pl-14`}>
                        <CommentCard comment={comment} context="inline" />
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

/** One anchorable table row: a sticky gutter cell (line label + "+") followed by
 * the row's rendered cells, injected as raw HTML so the real `<td>`/`<th>` grid
 * stays a single table. The gutter button carries the shared `.gutter-cell` look.
 * Selection styling is driven by `aria-selected`. */
function TableRow(props: { startLine: number; endLine: number; cells: string; selected: boolean }) {
  const label =
    props.startLine === props.endLine ? `${props.startLine}` : `${props.startLine}-${props.endLine}`;
  const gutter =
    `<td class="md-gutter" data-line-start="${props.startLine}" data-line-end="${props.endLine}">` +
    `<button type="button" class="gutter-cell" title="Add a comment on line ${props.startLine} (Shift-click to extend)" aria-label="Add a comment on line ${props.startLine}">` +
    `<span class="gutter-plus">${PLUS_SVG}</span>${label}` +
    `</button></td>`;

  return (
    <tr
      id={`line-${props.startLine}`}
      aria-selected={props.selected}
      dangerouslySetInnerHTML={{ __html: gutter + props.cells }}
    />
  );
}

const RawView = observer(function RawView(props: EditorProps) {
  const lines = props.content.split("\n");
  const unanchored = props.comments.filter((c) => !c.anchor);
  const chrome = props.nested ? "" : "rounded-xl border border-line bg-editor";

  return (
    <article className={`${chrome} px-2 py-4 font-mono text-[13px] sm:px-3 sm:py-6`}>
      {props.inline &&
        unanchored.map((comment) => (
          <div key={comment.id} className={`${COMMENT_CLAMP} px-4 pt-3`}>
            <CommentCard comment={comment} context="inline" />
          </div>
        ))}

      {uiStore.wrapLines ? (
        lines.map((line, i) => (
          <RawLine
            key={i}
            lineNo={i + 1}
            line={line}
            tokens={props.rawLines?.[i]}
            comments={props.comments}
            inline={props.inline}
            content={props.content}
          />
        ))
      ) : (
        <RawScrolled
          lines={lines}
          rawLines={props.rawLines}
          comments={props.comments}
          inline={props.inline}
          content={props.content}
        />
      )}
    </article>
  );
});

/** Render one raw source line's content: syntax tokens when highlighted, else the
 * plain text (a single space keeps a blank line clickable). */
function rawContent(line: string, tokens: ThemedToken[] | undefined): React.ReactNode {
  if (line === "") return " ";
  if (tokens) {
    return tokens.map((token, j) => (
      <span key={j} style={tokenStyle(token)}>
        {token.content}
      </span>
    ));
  }
  return line;
}

/** One wrapped raw source line: a `[gutter | content]` grid that wraps and never
 * scrolls, mirroring `BlockRow`. */
const RawLine = observer(function RawLine(props: {
  lineNo: number;
  line: string;
  tokens: ThemedToken[] | undefined;
  comments: Comment[];
  inline: boolean;
  content: string;
}) {
  const ui = uiStore;
  const fileScope = useFileScope();
  const lineNo = props.lineNo;
  const draft = ui.draftFor(fileScope);
  const selStart = draft?.selStart ?? null;
  const selEnd = draft?.selEnd ?? null;
  const selected = selStart != null && selEnd != null && lineNo <= selEnd && lineNo >= selStart;

  return (
    <div>
      <div
        className={`md-row grid grid-cols-[var(--gutter-w)_minmax(0,1fr)] items-baseline ${selected ? "bg-active-line" : "hover:bg-hover"}`}
        id={`line-${lineNo}`}
        aria-selected={selected}
      >
        <GutterCell
          startLine={lineNo}
          endLine={lineNo}
          selected={selected}
          onClick={(e) => {
            const extend = selStart != null && e.shiftKey;
            if (extend) ui.extendSelection(lineNo, lineNo, fileScope);
            else ui.openComposer(lineNo, lineNo, "located", fileScope);
          }}
        />
        <span className="min-w-0 whitespace-pre-wrap pl-2 text-text">
          {rawContent(props.line, props.tokens)}
        </span>
      </div>

      <RowAside
        startLine={lineNo}
        endLine={lineNo}
        comments={props.comments}
        inline={props.inline}
        content={props.content}
        fileScope={fileScope}
      />
    </div>
  );
});

interface RawLineData extends LineLike {
  text: string;
  tokens: ThemedToken[] | undefined;
}

/** Raw source in no-wrap mode: a fixed-width gutter column outside one horizontal
 * scroller holding every line, so the lines scroll together and the gutter can't
 * drift. Asides split it into scroll runs, same as the code fence. */
const RawScrolled = observer(function RawScrolled(props: {
  lines: string[];
  rawLines: ThemedToken[][] | null;
  comments: Comment[];
  inline: boolean;
  content: string;
}) {
  const ui = uiStore;
  const fileScope = useFileScope();
  const draft = ui.draftFor(fileScope);
  const selStart = draft?.selStart ?? null;
  const selEnd = draft?.selEnd ?? null;

  const data: RawLineData[] = props.lines.map((text, i) => ({
    startLine: i + 1,
    endLine: i + 1,
    text,
    tokens: props.rawLines?.[i],
  }));

  const onLineClick = (line: number, shift: boolean) => {
    if (selStart != null && shift) ui.extendSelection(line, line, fileScope);
    else ui.openComposer(line, line, "located", fileScope);
  };

  const items = splitRuns(data, (l) =>
    lineHasAside(l, selEnd, props.comments, props.inline),
  );

  return (
    <>
      {items.map((item, i) =>
        item.type === "aside" ? (
          <RowAside
            key={`aside-${item.line.startLine}`}
            startLine={item.line.startLine}
            endLine={item.line.endLine}
            comments={props.comments}
            inline={props.inline}
            content={props.content}
            fileScope={fileScope}
          />
        ) : (
          <RawRun
            key={`run-${i}-${item.lines[0].startLine}`}
            lines={item.lines}
            selStart={selStart}
            selEnd={selEnd}
            onLineClick={onLineClick}
          />
        ),
      )}
    </>
  );
});

/** One contiguous scroll unit of raw source lines. Cross-column hover from JS,
 * mirroring `CodeRun`. */
function RawRun(props: {
  lines: RawLineData[];
  selStart: number | null;
  selEnd: number | null;
  onLineClick: (line: number, shift: boolean) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const lineAt = (target: EventTarget | null): number | null => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-line]");
    return el ? Number(el.dataset.line) : null;
  };
  const selected = (line: number) =>
    props.selStart != null && props.selEnd != null && line >= props.selStart && line <= props.selEnd;

  return (
    <div
      className="flex"
      onPointerMove={(e) => {
        const ln = lineAt(e.target);
        setHovered((prev) => (prev === ln ? prev : ln));
      }}
      onPointerLeave={() => setHovered(null)}
      onClick={(e) => {
        const ln = lineAt(e.target);
        if (ln != null) props.onLineClick(ln, e.shiftKey);
      }}
    >
      <div className="flex shrink-0 flex-col">
        {props.lines.map((l) => (
          <GutterCell
            key={`g-${l.startLine}`}
            startLine={l.startLine}
            endLine={l.startLine}
            selected={selected(l.startLine)}
            hovered={hovered === l.startLine}
            className="h-[1.5rem] items-center"
            onClick={(e) => {
              e.stopPropagation();
              props.onLineClick(l.startLine, e.shiftKey);
            }}
          />
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="w-max min-w-full">
          {props.lines.map((l) => {
            const sel = selected(l.startLine);
            return (
              <div
                key={`c-${l.startLine}`}
                data-line={l.startLine}
                id={`line-${l.startLine}`}
                aria-selected={sel}
                className={`h-[1.5rem] ${sel ? "bg-active-line" : hovered === l.startLine ? "bg-hover" : ""}`}
              >
                <span className="block whitespace-pre pl-2 leading-[1.5rem] text-text">
                  {rawContent(l.text, l.tokens)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Reading-rhythm gap above each rendered block (margin-top only, so adjacent
 * rows never double their margins). Headings open a section, then hug the body
 * that follows; code/mermaid/tables get a wider break; prose stays calm. Tier
 * widths come from the active density.
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
