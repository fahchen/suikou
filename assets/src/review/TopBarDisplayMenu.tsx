import { observer } from "mobx-react-lite";
import { useNavigate } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";

import { uiStore } from "../stores/ui-store";
import { THEMES, THEME_LABELS } from "../themes";
import type { CritiqueType, Density, StatusFilter } from "../stores/ui-store";
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

/** View preferences and comment filters: layout, markdown mode, theme, status, type. */
export const TopBarDisplayMenu = observer(function TopBarDisplayMenu(props: {
  artifactId: string;
  rawView: boolean;
  previewable: boolean;
}) {
  const { artifactId, rawView, previewable } = props;
  const ui = uiStore;
  const navigate = useNavigate();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="pill"
            size="icon-xs"
            title="Display settings"
          >
            <SlidersHorizontal className="size-4 text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-3">
        <div className="flex flex-col gap-3">
          <Row label="Comments">
            <ToggleGroup
              size="sm"
              variant="outline"
              value={[ui.hideComments ? "hidden" : ui.commentMode]}
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
              <ToggleGroupItem value="side">Side</ToggleGroupItem>
              <ToggleGroupItem value="hidden">Hide</ToggleGroupItem>
            </ToggleGroup>
          </Row>

          {previewable && (
            <Row label="Markdown">
              <ToggleGroup
                size="sm"
                variant="outline"
                value={[rawView ? "raw" : "rendered"]}
                onValueChange={(v) =>
                  v[0] &&
                  void navigate({
                    to: v[0] === "raw" ? "/review/$artifactId/raw" : "/review/$artifactId",
                    params: { artifactId },
                  })
                }
              >
                <ToggleGroupItem value="rendered">Rendered</ToggleGroupItem>
                <ToggleGroupItem value="raw">Raw</ToggleGroupItem>
              </ToggleGroup>
            </Row>
          )}

          {(rawView || !previewable) && (
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

          <Row label="Theme">
            <Select value={ui.theme} onValueChange={(v) => ui.setTheme(v as (typeof THEMES)[number])}>
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
                  className={`rounded-lg border px-2 py-0.5 text-[11px] transition-colors ${
                    ui.typeFilters[type]
                      ? "border-transparent bg-tint text-heading"
                      : "border-line bg-transparent text-faint hover:bg-hover"
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
