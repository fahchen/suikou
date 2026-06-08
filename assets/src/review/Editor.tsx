import { observer } from "mobx-react-lite";
import { AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";

import { uiStore } from "../stores/ui-store";
import type { DocView } from "../stores/ui-store";
import type { RenderedBlock } from "../markdown/render";
import type { Comment } from "./types";
import { Composer } from "./Composer";
import { CommentCard } from "./CommentCard";
import { Button } from "@/components/ui/button";

interface EditorProps {
  view: DocView;
  content: string;
  blocks: RenderedBlock[];
  loading: boolean;
  comments: Comment[];
  inline: boolean;
}

const KIND_CLASS: Record<RenderedBlock["kind"], string> = {
  markdown: "md-content",
  code: "md-code",
  mermaid: "md-mermaid",
};

export const Editor = observer(function Editor(props: EditorProps) {
  if (props.view === "raw") return <RawView {...props} />;
  return <RenderView {...props} />;
});

const RenderView = observer(function RenderView(props: EditorProps) {
  const unanchored = props.comments.filter((c) => !c.anchor);

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-editor">
      {props.inline &&
        unanchored.map((comment) => (
          <div key={comment.id} className="px-4 pt-3">
            <CommentCard comment={comment} context="inline" />
          </div>
        ))}

      {props.loading && <p className="px-6 py-8 text-sm text-muted-foreground">Rendering…</p>}

      {props.blocks.map((block) => (
        <LineRow
          key={`${block.startLine}-${block.kind}`}
          startLine={block.startLine}
          endLine={block.endLine}
          comments={props.comments}
          inline={props.inline}
          content={props.content}
        >
          <div
            className={`min-w-0 flex-1 py-1.5 ${KIND_CLASS[block.kind]}`}
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
    <article className="overflow-hidden rounded-xl border border-line bg-editor font-mono text-[13px]">
      {props.inline &&
        unanchored.map((comment) => (
          <div key={comment.id} className="px-4 pt-3">
            <CommentCard comment={comment} context="inline" />
          </div>
        ))}

      {lines.map((line, i) => {
        const lineNo = i + 1;
        return (
          <LineRow
            key={i}
            startLine={lineNo}
            endLine={lineNo}
            comments={props.comments}
            inline={props.inline}
            content={props.content}
          >
            <span className="min-w-0 flex-1 whitespace-pre-wrap py-1.5 pl-2 text-text">
              {line || " "}
            </span>
          </LineRow>
        );
      })}
    </article>
  );
});

/**
 * A single anchorable row: gutter line label + add-comment button, the content
 * slot supplied by the caller, plus the inline composer and anchored comments.
 * Shared by the rendered (per-block) and raw (per-line) views.
 */
const LineRow = observer(function LineRow(props: {
  startLine: number;
  endLine: number;
  comments: Comment[];
  inline: boolean;
  content: string;
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
    <div>
      <div
        className={`group flex items-start gap-2 px-2 sm:gap-3 sm:px-4 ${selected ? "bg-active-line" : "hover:bg-hover"}`}
        id={`line-${startLine}`}
        aria-selected={selected}
      >
        <span className="relative w-10 shrink-0 select-none py-1.5 text-right font-mono text-[12px] text-faint">
          {selected && <span className="absolute -left-1 top-0 h-full w-0.5 bg-blue" aria-hidden />}
          {label}
          <Button
            size="icon-xs"
            title={`Add a comment on line ${startLine} (Shift-click to extend)`}
            aria-label="Add a comment"
            className="absolute -left-1 top-1 hidden bg-blue text-on-accent hover:bg-blue group-hover:inline-flex"
            onClick={(e) => {
              if (e.shiftKey && ui.selStart != null) {
                ui.extendSelection(startLine, endLine);
              } else {
                ui.openComposer(startLine, endLine, "line");
              }
            }}
          >
            <Plus size={13} />
          </Button>
        </span>
        {props.children}
      </div>

      <AnimatePresence>
        {composerOpen && selStart != null && selEnd != null && (
          <Composer
            startLine={selStart}
            endLine={selEnd}
            selectedText={props.content.split("\n").slice(selStart - 1, selEnd).join("\n")}
          />
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {inlineComments.map((comment) => (
          <div key={comment.id} className="px-2 pb-2 pl-10 sm:px-4 sm:pl-14">
            <CommentCard comment={comment} context="inline" />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
});
