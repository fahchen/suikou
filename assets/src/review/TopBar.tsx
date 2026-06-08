import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate, useLocation } from "@tanstack/react-router";

import { uiStore } from "../stores/ui-store";
import { THEMES, THEME_LABELS } from "../themes";
import { useReviewCommands } from "./commands";
import { pendingCount, hasUnresolvedBlocker } from "./store-context";
import { VERDICT_META, type ReviewSnapshot, type Verdict } from "./types";
import type { CritiqueType, StatusFilter } from "../stores/ui-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  List,
  FileText,
  Folder,
  ChevronDown,
  GitCompare,
  SlidersHorizontal,
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
  const navigate = useNavigate();
  const location = useLocation();
  const rawView = location.pathname.endsWith("/raw");
  const [verdict, setVerdict] = useState<Verdict>(snapshot.latest_verdict ?? "request_changes");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewType, setReviewType] = useState<CritiqueType>("note");

  const toc = tableOfContents(snapshot.current_round.content);
  const pending = pendingCount(snapshot.comments.items);
  const blocker = hasUnresolvedBlocker(snapshot.comments.items);

  // A review-scoped comment carries no anchor and is authored as a pending draft;
  // Submit publishes it alongside the line comments (see authoring.feature).
  function addReviewComment() {
    const body = reviewBody.trim();
    if (!body) return;
    void commands.addComment.dispatch({
      scope: "review",
      critique_type: reviewType,
      body,
      start_line: null,
      end_line: null,
    });
    setReviewBody("");
  }

  return (
    <header className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="icon" title="Table of contents">
                <List size={16} />
              </Button>
            }
          />
          <PopoverContent align="start" className="w-64 p-2">
            <div className="flex flex-col gap-0.5">
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
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" className="min-w-0 px-2">
                <span className="truncate font-semibold tracking-[-0.006em] text-heading">
                  {snapshot.artifact.title}
                </span>
                <ChevronDown size={14} className="shrink-0 text-faint" />
              </Button>
            }
          />
          <PopoverContent align="start" className="w-72 p-2">
            <div className="flex flex-col gap-0.5">
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
                    onClick={() =>
                      void navigate({
                        to: rawView ? "/review/$artifactId/raw" : "/review/$artifactId",
                        params: { artifactId: artifact.id },
                      })
                    }
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
          </PopoverContent>
        </Popover>

        <div className="hidden items-center gap-2 font-mono text-[11px] text-faint sm:flex">
          <span>round {snapshot.current_round.number}</span>
          <span aria-hidden>·</span>
          <span>{snapshot.current_round.is_latest ? "latest round" : "superseded"}</span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm">
                <GitCompare size={15} className="text-muted-foreground" />
                <span className="hidden text-[12px] font-medium sm:inline">R{snapshot.current_round.number}</span>
                <ChevronDown size={13} className="text-faint" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-60 p-2">
            <div className="flex flex-col gap-0.5">
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
              {snapshot.rounds.length >= 2 &&
                (() => {
                  const prev = snapshot.rounds[snapshot.rounds.length - 2].number;
                  const last = snapshot.rounds[snapshot.rounds.length - 1].number;
                  return (
                    <>
                      <div className="my-1 border-t border-line-soft" />
                      <button
                        type="button"
                        className="flex flex-col rounded px-2 py-1.5 text-left hover:bg-hover"
                        onClick={() => void commands.diffRound.dispatch({ from: prev, to: last })}
                      >
                        <span className="text-[13px] font-medium text-heading">
                          Diff R{prev} → R{last}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Compare changes across rounds.
                        </span>
                      </button>
                    </>
                  );
                })()}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="icon" title="Display settings">
                <SlidersHorizontal size={16} />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-64 p-3">
            <div className="flex flex-col gap-3">
              <Row label="Comments">
                <ToggleGroup
                  size="sm"
                  variant="outline"
                  value={[ui.commentMode]}
                  onValueChange={(v) => v[0] && ui.setCommentMode(v[0] as "inline" | "side")}
                >
                  <ToggleGroupItem value="inline">Inline</ToggleGroupItem>
                  <ToggleGroupItem value="side">Side</ToggleGroupItem>
                </ToggleGroup>
              </Row>

              <Row label="Markdown">
                <ToggleGroup
                  size="sm"
                  variant="outline"
                  value={[rawView ? "raw" : "rendered"]}
                  onValueChange={(v) =>
                    v[0] &&
                    void navigate({
                      to: v[0] === "raw" ? "/review/$artifactId/raw" : "/review/$artifactId",
                      params: { artifactId: snapshot.artifact.id },
                    })
                  }
                >
                  <ToggleGroupItem value="rendered">Rendered</ToggleGroupItem>
                  <ToggleGroupItem value="raw">Raw</ToggleGroupItem>
                </ToggleGroup>
              </Row>

              <Row label="Theme">
                <Select
                  value={ui.theme}
                  onValueChange={(v) => ui.setTheme(v as (typeof THEMES)[number])}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THEMES.map((theme) => (
                      <SelectItem key={theme} value={theme}>
                        {THEME_LABELS[theme]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>

              <div className="border-t border-line-soft pt-2 text-[11px] uppercase tracking-wide text-faint">
                Filter comments
              </div>

              <Row label="Status">
                <ToggleGroup
                  size="sm"
                  variant="outline"
                  value={[ui.statusFilter]}
                  onValueChange={(v) => v[0] && ui.setStatusFilter(v[0] as StatusFilter)}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
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
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                title="File review verdict"
                className={
                  verdict === "request_changes"
                    ? "border-red/40 bg-red-soft hover:bg-red-soft"
                    : verdict === "approve"
                      ? "border-green/40 bg-green/15 hover:bg-green/20"
                      : undefined
                }
              >
                <VerdictIcon verdict={verdict} />
                <ChevronDown size={13} className="text-faint" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-72 p-2">
            <div className="flex flex-col gap-0.5">
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

              <div className="mt-1 border-t border-line-soft pt-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-faint">
                    Review comment
                  </span>
                  <div className="flex gap-1">
                    {TYPE_OPTIONS.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          reviewType === type
                            ? "bg-blue text-on-accent"
                            : "bg-soft text-faint hover:bg-hover"
                        }`}
                        onClick={() => setReviewType(type)}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  className="min-h-16 w-full resize-y rounded border border-line bg-control px-2 py-1.5 text-[12px]"
                  placeholder="Comment on the whole review. Published on submit."
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                />
                <div className="mt-1.5 flex justify-end">
                  <Button
                    size="sm"
                    disabled={commands.addComment.isPending || !reviewBody.trim()}
                    onClick={addReviewComment}
                  >
                    Add comment
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          title="Submit review"
          disabled={commands.submitReview.isPending}
          onClick={() => void commands.submitReview.dispatch({ verdict })}
        >
          <Check size={14} /> <span className="hidden sm:inline">Submit</span>
          {pending > 0 && (
            <Badge className="bg-blue-strong text-on-accent">{pending}</Badge>
          )}
        </Button>
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

function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] text-muted-foreground">{props.label}</span>
      {props.children}
    </div>
  );
}
