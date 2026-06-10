import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useLocation } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { useReviewCommands } from "./commands";
import { pendingCount } from "./store-context";
import { type ReviewSnapshot, type Verdict } from "./types";
import { TopBarTocMenu } from "./TopBarTocMenu";
import { TopBarArtifactMenu } from "./TopBarArtifactMenu";
import { TopBarRoundMenu } from "./TopBarRoundMenu";
import { TopBarDisplayMenu } from "./TopBarDisplayMenu";
import { TopBarVerdictMenu } from "./TopBarVerdictMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const TopBar = observer(function TopBar(props: { snapshot: ReviewSnapshot }) {
  const { snapshot } = props;
  const commands = useReviewCommands();
  const rawView = useLocation().pathname.endsWith("/raw");
  const [verdict, setVerdict] = useState<Verdict>(snapshot.latest_verdict ?? "request_changes");

  const pending = pendingCount(snapshot.comments.items);

  return (
    <header className="pointer-events-none sticky top-0 z-20 flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <TopBarTocMenu content={snapshot.current_round.content} />
        <TopBarArtifactMenu snapshot={snapshot} rawView={rawView} />
      </div>

      <div className="pointer-events-auto ml-auto flex items-center gap-2">
        <TopBarRoundMenu snapshot={snapshot} />
        <TopBarDisplayMenu artifactId={snapshot.artifact.id} rawView={rawView} />
        <TopBarVerdictMenu snapshot={snapshot} verdict={verdict} onVerdictChange={setVerdict} />

        <Button
          title="Submit review"
          disabled={commands.submitReview.isPending}
          onClick={() => void commands.submitReview.dispatch({ verdict })}
        >
          <Check size={14} /> <span className="hidden sm:inline">Submit</span>
          {pending > 0 && <Badge className="bg-blue-strong text-on-accent">{pending}</Badge>}
        </Button>
      </div>
    </header>
  );
});
