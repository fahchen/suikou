import { observer } from "mobx-react-lite";
import { useNavigate } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";

import { uiStore } from "../stores/ui-store";
import { THEMES, THEME_LABELS, type ThemeName } from "../themes";
import type {
  CritiqueType,
  Density,
  DiffLayout,
  FileDisplayMode,
  StatusFilter,
} from "../stores/ui-store";
import { CRITIQUE_META } from "./types";
import type { ViewCapabilities, ViewKind } from "./view-kind";
import { reviewFileTarget } from "./review-navigation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unresolved", label: "Open" },
  { value: "resolved", label: "Resolved" },
];
const TYPE_OPTIONS: CritiqueType[] = ["fix_required", "needs_answer", "note"];
const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "tight", label: "Tight" },
  { value: "normal", label: "Normal" },
  { value: "loose", label: "Loose" },
];

/**
 * View preferences and comment filters. Each row is gated by `capabilities` so
 * a setting only appears when it is meaningful for the current file (no markdown
 * flavor for diffs, no diff layout for files, no wrap for images, etc).
 */
export const TopBarDisplayMenu = observer(function TopBarDisplayMenu(props: {
  reviewId: string;
  filePath: string;
  sourceView: boolean;
  capabilities: ViewCapabilities;
  viewKind: ViewKind;
  /** Side-by-side diff fits only on wide screens; narrow forces unified. */
  diffLayoutAllowed: boolean;
  /**
   * The side comment rail only earns a column on wide screens; below that the
   * layout forces inline, so the "Side" toggle is hidden to avoid a dead control.
   */
  sideCommentsAllowed: boolean;
}) {
  const { reviewId, filePath, sourceView, capabilities, viewKind, diffLayoutAllowed, sideCommentsAllowed } =
    props;
  const renderedLabel = viewKind === "html" ? "HTML" : "Markdown";
  const ui = uiStore;
  const navigate = useNavigate();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="pill"
            size="icon"
            title="Display settings"
          >
            <SlidersHorizontal className="text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-3">
        <div className="flex flex-col gap-3">
          <Row label="Files">
            <ToggleGroup
              size="xs"
              variant="outline"
              spacing={0}
              value={[ui.fileDisplayMode]}
              onValueChange={(v) => {
                if (!v[0]) return;
                ui.setFileDisplayMode(v[0] as FileDisplayMode);
                if (v[0] === "all") {
                  void navigate({ to: "/reviews/$reviewId", params: { reviewId } });
                } else {
                  void navigate(reviewFileTarget(reviewId, filePath, false));
                }
              }}
            >
              <ToggleGroupItem value="single">One</ToggleGroupItem>
              <ToggleGroupItem value="all">All</ToggleGroupItem>
            </ToggleGroup>
          </Row>

          {ui.fileDisplayMode === "all" && (
            <Row label="Reviewed">
              <ToggleGroup
                size="sm"
                variant="outline"
                value={[ui.hideReviewed ? "hide" : "show"]}
                onValueChange={(v) =>
                  v[0] && ui.setHideReviewed(v[0] === "hide")
                }
              >
                <ToggleGroupItem value="show">Show</ToggleGroupItem>
                <ToggleGroupItem value="hide">Hide</ToggleGroupItem>
              </ToggleGroup>
            </Row>
          )}

          {capabilities.comments && (
            <Row label="Comments">
              <ToggleGroup
                size="sm"
                variant="outline"
                value={[
                  ui.hideComments
                    ? "hidden"
                    : sideCommentsAllowed
                      ? ui.commentMode
                      : "inline",
                ]}
                onValueChange={(v) => {
                  if (!v[0]) return;
                  if (v[0] === "hidden") {
                    ui.setHideComments(true);
                  } else {
                    ui.setHideComments(false);
                    ui.setCommentMode(v[0] as "inline" | "side");
                  }
                }}
              >
                <ToggleGroupItem value="inline">Inline</ToggleGroupItem>
                {sideCommentsAllowed && <ToggleGroupItem value="side">Side</ToggleGroupItem>}
                <ToggleGroupItem value="hidden">Hide</ToggleGroupItem>
              </ToggleGroup>
            </Row>
          )}

          {capabilities.diffLayout && diffLayoutAllowed && (
            <Row label="Diff">
              <ToggleGroup
                size="sm"
                variant="outline"
                value={[ui.diffLayout]}
                onValueChange={(v) =>
                  v[0] && ui.setDiffLayout(v[0] as DiffLayout)
                }
              >
                <ToggleGroupItem value="unified">Unified</ToggleGroupItem>
                <ToggleGroupItem value="side">Split</ToggleGroupItem>
              </ToggleGroup>
            </Row>
          )}

          {capabilities.sourceToggle && (
            <Row label={renderedLabel}>
              <ToggleGroup
                size="sm"
                variant="outline"
                value={[sourceView ? "source" : "rendered"]}
                onValueChange={(v) =>
                  v[0] &&
                  void navigate(reviewFileTarget(reviewId, filePath, v[0] === "source"))
                }
              >
                <ToggleGroupItem value="rendered">Rendered</ToggleGroupItem>
                <ToggleGroupItem value="source">Source</ToggleGroupItem>
              </ToggleGroup>
            </Row>
          )}

          {capabilities.markdownFlavor && (
            <Row label="Flavor">
              <ToggleGroup
                size="sm"
                variant="outline"
                value={[ui.markdownFlavor]}
                onValueChange={(v) => v[0] && ui.setMarkdownFlavor(v[0] as "gfm" | "commonmark")}
              >
                <ToggleGroupItem value="gfm">GFM</ToggleGroupItem>
                <ToggleGroupItem value="commonmark">CommonMark</ToggleGroupItem>
              </ToggleGroup>
            </Row>
          )}

          {capabilities.wrapLines && (
            <Row label="Wrap">
              <ToggleGroup
                size="sm"
                variant="outline"
                value={[ui.wrapLines ? "on" : "off"]}
                onValueChange={(v) => v[0] && ui.setWrapLines(v[0] === "on")}
              >
                <ToggleGroupItem value="on">On</ToggleGroupItem>
                <ToggleGroupItem value="off">Off</ToggleGroupItem>
              </ToggleGroup>
            </Row>
          )}

          {capabilities.density && (
            <Row label="Spacing">
              <ToggleGroup
                size="sm"
                variant="outline"
                value={[ui.density]}
                onValueChange={(v) => v[0] && ui.setDensity(v[0] as Density)}
              >
                {DENSITY_OPTIONS.map((option) => (
                  <ToggleGroupItem key={option.value} value={option.value}>
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Row>
          )}

          <Row label="Theme">
            <Select value={ui.theme} onValueChange={(v) => ui.setTheme(v as (typeof THEMES)[number])}>
              <SelectTrigger size="sm">
                <SelectValue>
                  {(value: ThemeName) => THEME_LABELS[value]}
                </SelectValue>
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

          {capabilities.comments && (
            <>
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
                      aria-pressed={ui.typeFilters[type]}
                      className={`cursor-pointer rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                        ui.typeFilters[type]
                          ? "border-transparent bg-tint text-heading"
                          : "border-line bg-transparent text-faint hover:bg-hover hover:text-muted-foreground"
                      }`}
                      onClick={() => ui.toggleType(type)}
                    >
                      {CRITIQUE_META[type].label}
                    </button>
                  ))}
                </div>
              </Row>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});

function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] text-muted-foreground">{props.label}</span>
      {props.children}
    </div>
  );
}
