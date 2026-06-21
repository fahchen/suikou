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
  const summaries = reviewSnapshot.body.round_summaries;
  // No rounds yet (nothing minted) — nothing to switch between.
  if (summaries.length === 0) return null;

  const latest = reviewSnapshot.body.latest_round;
  const current = reviewSnapshot.body.selected_round;
  const isLatest = current === latest;
  const triggerLabel = isLatest
    ? `Round ${current} (under review), switch rounds`
    : `Round ${current} (superseded; round ${latest} is current), switch rounds`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="pill" size="default" title={triggerLabel} aria-label={triggerLabel}>
            <GitCompare className="text-muted-foreground" />
            <span className="hidden text-[11px] font-medium sm:inline">R{current}</span>
            <ChevronDown className="text-faint" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-60 p-2">
        <div className="flex flex-col gap-0.5">
          {[...summaries].reverse().map((round) => {
            const isCurrent = round.number === current;
            return (
              <button
                key={round.number}
                type="button"
                className={`flex cursor-pointer flex-col rounded px-2 py-1.5 text-left transition-colors ${isCurrent ? "bg-tint" : "hover:bg-hover"}`}
                onClick={() => void selectRound.dispatch({ number: round.number })}
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-heading">
                  Round {round.number}
                  {round.number === latest ? (
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
