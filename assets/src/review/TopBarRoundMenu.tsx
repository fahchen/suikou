import { observer } from "mobx-react-lite";
import { GitCompare, ChevronDown } from "lucide-react";

import { useMusubiCommand, useMusubiSnapshot } from "../musubi";
import { useReviewStore } from "./store-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Round picker. The viewed round is review-wide — switching it moves every
 * file at once — so the list, counts, and selection all come from the
 * ReviewStore root (its body child) and the picker works identically in single-
 * and all-files mode. */
export const TopBarRoundMenu = observer(function TopBarRoundMenu() {
  const reviewStore = useReviewStore();
  const reviewSnapshot = useMusubiSnapshot(reviewStore);
  const selectRound = useMusubiCommand(reviewStore, "select_round");
  if (!reviewSnapshot) return null;
  const summaries = reviewSnapshot.body.round_summaries;
  const latest = reviewSnapshot.body.latest_round;
  const current = reviewSnapshot.body.selected_round;
  const isLatest = current === latest;
  // No rounds at all = empty review with no artifacts; the picker has nothing
  // to show.
  if (summaries.length === 0) return null;
  const entries = summaries;
  // latest === 0 means round 0 was never submitted (a submit would have opened
  // round 1 and pushed latest ≥ 1). Round 0 is the initial draft: it holds
  // pending comments and a draft verdict, nothing published yet. Any round
  // that reached publish is under review at latest, superseded otherwise.
  const isDraft = latest === 0;
  const triggerLabel = isDraft
    ? `Round ${current} (draft), switch rounds`
    : isLatest
    ? `Round ${current} (under review), switch rounds`
    : `Round ${current} (superseded; round ${latest} is current), switch rounds`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="pill" size="default" title={triggerLabel} aria-label={triggerLabel}>
            <GitCompare className="text-muted-foreground" />
            <span className="hidden text-[11px] font-medium sm:inline">Round {current}</span>
            <ChevronDown className="text-faint" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-60 p-2">
        <div className="flex flex-col gap-0.5">
          {[...entries].reverse().map((round) => {
            const isCurrent = round.number === current;
            const isDraftRow = isDraft && round.number === latest;
            return (
              <button
                key={round.number}
                type="button"
                className={`flex cursor-pointer flex-col rounded px-2 py-1.5 text-left transition-colors ${isCurrent ? "bg-tint" : "hover:bg-hover"}`}
                onClick={() => void selectRound.dispatch({ number: round.number })}
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-heading">
                  Round {round.number}
                  {isDraftRow ? (
                    <span className="text-[11px] font-normal text-faint">draft</span>
                  ) : round.number === latest ? (
                    <span className="text-[11px] font-normal text-amber">under review</span>
                  ) : (
                    <span className="text-[11px] font-normal text-faint">superseded</span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {round.comment_count} comments
                  {round.unresolved_count > 0 && (
                    <span className="text-amber">
                      {" · "}
                      {round.unresolved_count} unresolved
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
});
