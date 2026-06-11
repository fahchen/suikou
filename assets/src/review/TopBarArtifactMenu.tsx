import { useNavigate } from "@tanstack/react-router";
import { FileText, Folder, ChevronDown } from "lucide-react";

import type { ReviewSnapshot } from "./types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Title button that opens the artifact switcher for this project. */
export function TopBarArtifactMenu(props: { snapshot: ReviewSnapshot; rawView: boolean }) {
  const { snapshot, rawView } = props;
  const navigate = useNavigate();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="pill"
            size="xs"
            title="Switch artifact"
            className="h-[30px] min-w-0 px-2.5"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="hidden truncate text-[12px] font-medium text-heading sm:inline">
              {snapshot.artifact.title}
            </span>
            <ChevronDown size={13} className="shrink-0 text-faint" />
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
                className={`flex items-center gap-2 rounded py-1.5 pl-6 pr-2 text-left text-[13px] ${
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
  );
}
