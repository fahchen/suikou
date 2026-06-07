import { observer } from "mobx-react-lite";
import { AnimatePresence } from "motion/react";

import { uiStore } from "../stores/ui-store";
import type { RenderedBlock } from "../markdown/render";
import type { Comment } from "./types";
import { Composer } from "./Composer";
import { CommentCard } from "./CommentCard";
import { Plus } from "lucide-react";

interface EditorProps {
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
  if (uiStore.view === "raw") {
    return <RawView content={props.content} />;
  }
  return <RenderView {...props} />;
});

const RenderView = observer(function RenderView(props: EditorProps) {
  const ui = uiStore;
  const unanchored = props.comments.filter((c) => !c.anchor);

  function commentsForBlock(block: RenderedBlock): Comment[] {
    if (!props.inline) return [];
    return props.comments.filter(
      (c) =>
        c.anchor && c.anchor.start_line >= block.startLine && c.anchor.start_line <= block.endLine,
    );
  }

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-editor">
      {props.inline &&
        unanchored.map((comment) => (
          <div key={comment.id} className="px-4 pt-3">
            <CommentCard comment={comment} />
          </div>
        ))}

      {props.loading && <p className="px-6 py-8 text-sm text-muted-foreground">Rendering…</p>}

      {props.blocks.map((block) => {
        const label =
          block.startLine === block.endLine
            ? `${block.startLine}`
            : `${block.startLine}-${block.endLine}`;
        const selStart = ui.selStart;
        const selEnd = ui.selEnd;
        const selected =
          selStart != null && selEnd != null && block.startLine <= selEnd && block.endLine >= selStart;
        const composerOpen = selStart != null && selEnd != null && block.endLine === selEnd;

        return (
          <div key={`${block.startLine}-${block.kind}`}>
            <div
              className={`group flex items-start gap-3 px-4 ${selected ? "bg-active-line" : "hover:bg-hover"}`}
              id={`line-${block.startLine}`}
              aria-selected={selected}
            >
              <span className="relative w-10 shrink-0 select-none py-1.5 text-right font-mono text-[12px] text-faint">
                {selected && (
                  <span className="absolute -left-1 top-0 h-full w-0.5 bg-blue" aria-hidden />
                )}
                {label}
                <button
                  type="button"
                  className="absolute -left-1 top-1 hidden size-5 place-items-center rounded bg-blue text-on-accent group-hover:grid"
                  title={`Add a comment on line ${block.startLine} (Shift-click to extend)`}
                  aria-label="Add a comment"
                  onClick={(e) => {
                    if (e.shiftKey && ui.selStart != null) {
                      ui.extendSelection(block.startLine, block.endLine);
                    } else {
                      ui.openComposer(block.startLine, block.endLine, "line");
                    }
                  }}
                >
                  <Plus size={13} />
                </button>
              </span>
              <div
                className={`min-w-0 flex-1 py-1.5 ${KIND_CLASS[block.kind]}`}
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
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
              {commentsForBlock(block).map((comment) => (
                <div key={comment.id} className="px-4 pb-2 pl-14">
                  <CommentCard comment={comment} />
                </div>
              ))}
            </AnimatePresence>
          </div>
        );
      })}
    </article>
  );
});

function RawView(props: { content: string }) {
  const lines = props.content.split("\n");
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-editor font-mono text-[13px]">
      {lines.map((line, i) => (
        <div key={i} className="flex hover:bg-hover">
          <span className="w-12 shrink-0 select-none py-0.5 pr-3 text-right text-[12px] text-faint">
            {i + 1}
          </span>
          <span className="flex-1 whitespace-pre-wrap py-0.5 pl-2 text-text">{line || " "}</span>
        </div>
      ))}
    </article>
  );
}
