import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useLocation } from "@tanstack/react-router";
import { Check, ChevronsDownUp, ChevronsUpDown } from "lucide-react";

import { uiStore } from "../stores/ui-store";
import { useReviewCommands } from "./commands";
import { pendingCount } from "./store-context";
import { VERDICT_META, type ReviewSnapshot, type Verdict } from "./types";
import { TopBarTocMenu } from "./TopBarTocMenu";
import { TopBarArtifactMenu } from "./TopBarArtifactMenu";
import { TopBarRoundMenu } from "./TopBarRoundMenu";
import { TopBarDisplayMenu } from "./TopBarDisplayMenu";
import { TopBarVerdictMenu, VerdictIcon } from "./TopBarVerdictMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const TopBar = observer(function TopBar(props: { snapshot: ReviewSnapshot }) {
  const { snapshot } = props;
  const commands = useReviewCommands();
  const rawView = useLocation().pathname.endsWith("/raw");
  const [verdict, setVerdict] = useState<Verdict>(snapshot.latest_verdict ?? "request_changes");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const pending = pendingCount(snapshot.comments.items);

  function submit() {
    void commands.submitReview.dispatch({ verdict });
    setConfirmOpen(false);
  }

  return (
    <header className="pointer-events-none sticky top-0 z-20 flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <TopBarTocMenu content={snapshot.current_round.content} />
        <TopBarArtifactMenu snapshot={snapshot} rawView={rawView} />
      </div>

      <div className="pointer-events-auto ml-auto flex items-center gap-2">
        <TopBarRoundMenu snapshot={snapshot} />
        <Button
          variant="outline"
          size="icon-sm"
          title={uiStore.commentsCollapsed ? "Expand all comments" : "Collapse all comments"}
          aria-label={uiStore.commentsCollapsed ? "Expand all comments" : "Collapse all comments"}
          onClick={() => uiStore.toggleCollapseAll()}
        >
          {uiStore.commentsCollapsed ? (
            <ChevronsUpDown size={14} />
          ) : (
            <ChevronsDownUp size={14} />
          )}
        </Button>
        <TopBarDisplayMenu artifactId={snapshot.artifact.id} rawView={rawView} />
        <TopBarVerdictMenu snapshot={snapshot} verdict={verdict} onVerdictChange={setVerdict} />

        <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
          <PopoverTrigger
            render={
              <Button title="Submit review">
                <Check size={14} /> <span className="hidden sm:inline">Submit</span>
                {pending > 0 && <Badge className="bg-blue-strong text-on-accent">{pending}</Badge>}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-72 p-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5">
                  <VerdictIcon verdict={verdict} size={16} />
                </span>
                <div className="flex flex-col">
                  <strong className="text-[13px] text-heading">Submit this review?</strong>
                  <span className="text-[12px] text-muted-foreground">
                    Files a <b>{VERDICT_META[verdict].label}</b> verdict
                    {pending > 0
                      ? ` and publishes ${pending} pending comment${pending === 1 ? "" : "s"}`
                      : ""}
                    .
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={commands.submitReview.isPending} onClick={submit}>
                  <Check size={14} /> Submit
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
});
