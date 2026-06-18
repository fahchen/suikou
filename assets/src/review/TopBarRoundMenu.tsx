import { GitCompare, ChevronDown } from "lucide-react";

import type { ReviewSnapshot } from "./types";
import { useReviewCommands } from "./commands";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Round picker. */
export function TopBarRoundMenu(props: { snapshot: ReviewSnapshot }) {
  const { snapshot } = props;
  const commands = useReviewCommands();
  const rounds = snapshot.rounds;
  const latest = rounds[rounds.length - 1].number;
  const current = snapshot.current_round.number;
  const isLatest = current === latest;
  const triggerLabel = isLatest
    ? `Round ${current} (under review), switch rounds`
    : `Round ${current} (superseded; round ${latest} is current), switch rounds`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="pill"
            size="default"
            title={triggerLabel}
            aria-label={triggerLabel}
          >
            <GitCompare className="text-muted-foreground" />
            <span className="hidden text-[11px] font-medium sm:inline">
              R{current}
            </span>
            <ChevronDown className="text-faint" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-60 p-2">
        <div className="flex flex-col gap-0.5">
          {[...rounds].reverse().map((round) => {
            const current = round.number === snapshot.current_round.number;
            return (
              <button
                key={round.number}
                type="button"
                className={`flex cursor-pointer flex-col rounded px-2 py-1.5 text-left transition-colors ${current ? "bg-tint" : "hover:bg-hover"}`}
                onClick={() => void commands.selectRound.dispatch({ number: round.number })}
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
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
