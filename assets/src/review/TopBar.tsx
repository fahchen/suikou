import { useState } from "react";
import { observer } from "mobx-react-lite";

import { uiStore } from "../stores/ui-store";
import { THEMES, THEME_LABELS } from "../themes";
import { useReviewCommands } from "./commands";
import { useSelectArtifact, pendingCount, hasUnresolvedBlocker } from "./store-context";
import { VERDICT_META, type ReviewSnapshot, type Verdict } from "./types";
import type { CritiqueType, StatusFilter } from "../stores/ui-store";
import {
  List,
  FileText,
  Folder,
  ChevronDown,
  GitCompare,
  SlidersHorizontal,
  Eye,
  Check,
  PencilLine,
  MessageSquare,
} from "lucide-react";

const VERDICTS: Verdict[] = ["comment", "request_changes", "approve"];
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unresolved", label: "Open" },
  { value: "resolved", label: "Resolved" },
];
const TYPE_OPTIONS: CritiqueType[] = ["fix_required", "needs_answer", "note"];

function VerdictIcon(props: { verdict: Verdict; size?: number }) {
  if (props.verdict === "approve")
    return <Check size={props.size ?? 15} className="text-green-text" />;
  if (props.verdict === "request_changes")
    return <PencilLine size={props.size ?? 15} className="text-red" />;
  return <MessageSquare size={props.size ?? 15} className="text-muted-foreground" />;
}

export const TopBar = observer(function TopBar(props: { snapshot: ReviewSnapshot }) {
  const { snapshot } = props;
  const ui = uiStore;
  const commands = useReviewCommands();
  const selectArtifact = useSelectArtifact();
  const [verdict, setVerdict] = useState<Verdict>(snapshot.latest_verdict ?? "request_changes");

  const toc = tableOfContents(snapshot.current_round.content);
  const pending = pendingCount(snapshot.comments);
  const blocker = hasUnresolvedBlocker(snapshot.comments);

  return (
    <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Menu
          summary={
            <IconButton title="Table of contents">
              <List size={16} />
            </IconButton>
          }
        >
          <div className="flex w-64 flex-col gap-0.5">
            {toc.map((item) => (
              <a
                key={item.line}
                href={`#line-${item.line}`}
                className="flex items-center justify-between rounded px-2 py-1 text-[13px] hover:bg-hover"
                style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
              >
                <span className="truncate">{item.text}</span>
                <span className="ml-2 text-faint">{item.line}</span>
              </a>
            ))}
          </div>
        </Menu>

        <Menu
          summary={
            <button
              className="flex min-w-0 items-center gap-1 rounded px-2 py-1 hover:bg-hover"
              type="button"
            >
              <span className="truncate font-medium text-heading">{snapshot.artifact.title}</span>
              <ChevronDown size={14} className="shrink-0 text-faint" />
            </button>
          }
        >
          <div className="flex w-72 flex-col gap-0.5">
            <div className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-muted-foreground">
              <Folder size={13} /> artifacts
            </div>
            {snapshot.artifacts.map((artifact) => {
              const active = artifact.id === snapshot.artifact.id;
              return (
                <button
                  key={artifact.id}
                  type="button"
                  className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] ${
                    active ? "bg-tint text-heading" : "hover:bg-hover"
                  }`}
                  onClick={() => selectArtifact(artifact.id)}
                >
                  <FileText size={14} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{artifact.title}</span>
                  <span className="text-[11px] text-faint">
                    {artifact.latest_round ? `R${artifact.latest_round}` : "—"}
                    {artifact.approved ? " · ready" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </Menu>

        <div className="hidden flex-col text-[11px] leading-tight text-muted-foreground sm:flex">
          <span>round {snapshot.current_round.number}</span>
          <span>{snapshot.current_round.is_latest ? "latest round" : "superseded"}</span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Menu
          summary={
            <button
              type="button"
              className="flex items-center gap-1 rounded border border-line px-2 py-1 hover:bg-hover"
            >
              <GitCompare size={15} className="text-muted-foreground" />
              <span className="text-[12px] font-medium">R{snapshot.current_round.number}</span>
              <ChevronDown size={13} className="text-faint" />
            </button>
          }
        >
          <div className="flex w-60 flex-col gap-0.5">
            {[...snapshot.rounds].reverse().map((round) => {
              const current = round.number === snapshot.current_round.number;
              return (
                <button
                  key={round.number}
                  type="button"
                  className={`flex flex-col rounded px-2 py-1.5 text-left ${current ? "bg-tint" : "hover:bg-hover"}`}
                  onClick={() => void commands.selectRound.dispatch({ number: round.number })}
                >
                  <span className="flex items-center gap-2 text-[13px] font-medium text-heading">
                    Round {round.number}
                    {round.number === snapshot.rounds[snapshot.rounds.length - 1].number ? (
                      <span className="text-[11px] font-normal text-amber">under review</span>
                    ) : (
                      <span className="text-[11px] font-normal text-faint">superseded</span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{round.comment_count} comments</span>
                </button>
              );
            })}
          </div>
        </Menu>

        <Menu
          summary={
            <IconButton title="Display settings">
              <SlidersHorizontal size={16} />
            </IconButton>
          }
        >
          <div className="flex w-64 flex-col gap-3">
            <Row label="Comments">
              <Segmented
                options={[
                  { value: "inline", label: "Inline" },
                  { value: "side", label: "Side" },
                ]}
                value={ui.commentMode}
                onChange={(v) => ui.setCommentMode(v as "inline" | "side")}
              />
            </Row>

            <Row label="Markdown">
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[12px] ${
                  ui.view === "rendered"
                    ? "border-blue bg-tint text-heading"
                    : "border-line text-muted-foreground"
                }`}
                onClick={() => ui.setView(ui.view === "rendered" ? "raw" : "rendered")}
              >
                <Eye size={13} /> Preview
              </button>
            </Row>

            <Row label="Theme">
              <select
                className="rounded border border-line bg-control px-2 py-1 text-[12px]"
                value={ui.theme}
                onChange={(e) => ui.setTheme(e.target.value as (typeof THEMES)[number])}
              >
                {THEMES.map((theme) => (
                  <option key={theme} value={theme}>
                    {THEME_LABELS[theme]}
                  </option>
                ))}
              </select>
            </Row>

            <div className="border-t border-line-soft pt-2 text-[11px] uppercase tracking-wide text-faint">
              Filter comments
            </div>

            <Row label="Status">
              <Segmented
                options={STATUS_OPTIONS}
                value={ui.statusFilter}
                onChange={(v) => ui.setStatusFilter(v as StatusFilter)}
              />
            </Row>

            <Row label="Type">
              <div className="flex flex-wrap gap-1">
                {TYPE_OPTIONS.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`rounded px-1.5 py-0.5 text-[11px] ${
                      ui.typeFilters[type]
                        ? "bg-tint text-heading"
                        : "bg-soft text-faint line-through"
                    }`}
                    onClick={() => ui.toggleType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </Row>
          </div>
        </Menu>

        <Menu
          summary={
            <button
              type="button"
              className="flex items-center gap-1 rounded border border-line px-2 py-1 hover:bg-hover"
              title="File review verdict"
            >
              <VerdictIcon verdict={verdict} />
              <ChevronDown size={13} className="text-faint" />
            </button>
          }
        >
          <div className="flex w-64 flex-col gap-0.5">
            {VERDICTS.map((option) => (
              <button
                key={option}
                type="button"
                className={`flex items-start gap-2 rounded px-2 py-1.5 text-left ${
                  verdict === option ? "bg-tint" : "hover:bg-hover"
                }`}
                onClick={() => setVerdict(option)}
              >
                <span className="mt-0.5">
                  <VerdictIcon verdict={option} size={14} />
                </span>
                <span className="flex flex-col">
                  <strong className="text-[13px] text-heading">{VERDICT_META[option].label}</strong>
                  <small className="text-[11px] text-muted-foreground">
                    {VERDICT_META[option].description}
                  </small>
                </span>
              </button>
            ))}
            {blocker && verdict === "approve" && (
              <p className="mt-1 rounded bg-amber-soft px-2 py-1 text-[11px] text-amber">
                Unresolved <b>fix_required</b> — approve anyway?
              </p>
            )}
          </div>
        </Menu>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded bg-blue px-3 py-1.5 text-[12px] font-medium text-on-accent disabled:opacity-50"
          title="Submit review"
          disabled={commands.submitReview.isPending}
          onClick={() => void commands.submitReview.dispatch({ verdict })}
        >
          <Check size={14} /> Submit
          {pending > 0 && (
            <span className="rounded bg-blue-strong px-1.5 text-[11px]">{pending}</span>
          )}
        </button>
      </div>
    </header>
  );
});

function tableOfContents(content: string): { level: number; text: string; line: number }[] {
  const items: { level: number; text: string; line: number }[] = [];
  let inFence = false;

  content.split("\n").forEach((line, index) => {
    if (line.startsWith("```")) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = /^(#{1,4})\s+(.*)/.exec(line);
    if (match) {
      items.push({ level: match[1].length, text: match[2].trim(), line: index + 1 });
    }
  });

  return items;
}

function IconButton(props: { title: string; children: React.ReactNode }) {
  return (
    <span
      className="grid size-8 place-items-center rounded text-muted-foreground hover:bg-hover"
      title={props.title}
    >
      {props.children}
    </span>
  );
}

function Menu(props: { summary: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="relative">
      <summary className="list-none">{props.summary}</summary>
      <div className="absolute right-0 z-20 mt-1 rounded-lg border border-line bg-pop p-2 shadow-[var(--surface-shadow)]">
        {props.children}
      </div>
    </details>
  );
}

function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] text-muted-foreground">{props.label}</span>
      {props.children}
    </div>
  );
}

function Segmented<T extends string>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded border border-line bg-control p-0.5">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rounded px-2 py-0.5 text-[12px] ${
            props.value === option.value ? "bg-blue text-on-accent" : "text-muted-foreground hover:bg-hover"
          }`}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
