import { GitCompare, ChevronDown } from "lucide-react";

import type { ReviewSnapshot } from "./types";
import { useReviewCommands } from "./commands";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Round picker and round-to-round diff launcher. */
export function TopBarRoundMenu(props: { snapshot: ReviewSnapshot }) {
  const { snapshot } = props;
  const commands = useReviewCommands();
  const rounds = snapshot.rounds;
  const latest = rounds[rounds.length - 1].number;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <GitCompare size={15} className="text-muted-foreground" />
            <span className="hidden text-[12px] font-medium sm:inline">
              R{snapshot.current_round.number}
            </span>
            <ChevronDown size={13} className="text-faint" />
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
                className={`flex flex-col rounded px-2 py-1.5 text-left ${current ? "bg-tint" : "hover:bg-hover"}`}
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
          {rounds.length >= 2 &&
            (() => {
              const prev = rounds[rounds.length - 2].number;
              return (
                <>
                  <div className="my-1 border-t border-line-soft" />
                  <button
                    type="button"
                    className="flex flex-col rounded px-2 py-1.5 text-left hover:bg-hover"
                    onClick={() => void commands.diffRound.dispatch({ from: prev, to: latest })}
                  >
                    <span className="text-[13px] font-medium text-heading">
                      Diff R{prev} → R{latest}
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
  );
}
