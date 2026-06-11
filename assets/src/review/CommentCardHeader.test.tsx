import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Comment } from "./types";
import { Collapsible } from "@/components/ui/collapsible";

vi.mock("./commands", () => ({
  useReviewCommands: () => ({
    deleteComment: { dispatch: vi.fn(), isPending: false },
  }),
}));

import { CommentCardHeader } from "./CommentCardHeader";

function comment(overrides: Partial<Comment>): Comment {
  return {
    id: "c1",
    scope: "line",
    critique_type: "note",
    status: "pending",
    body: "body",
    resolved: false,
    resolved_round: null,
    outdated: false,
    original_round: null,
    carried: false,
    inserted_at: new Date().toISOString(),
    anchor: null,
    replies: [],
    ...overrides,
  };
}

function renderHeader(c: Comment) {
  return render(
    <Collapsible open>
      <CommentCardHeader comment={c} inline={false} open onEdit={() => {}} />
    </Collapsible>,
  );
}

describe("CommentCardHeader", () => {
  // A published comment is immutable server-side, so Edit/Delete must not be
  // offered — otherwise the action dispatches and silently fails.
  it("hides the actions menu for a published comment", () => {
    renderHeader(comment({ status: "published" }));
    expect(screen.queryByTitle("Comment actions")).toBeNull();
  });

  it("shows the actions menu for a pending comment", () => {
    renderHeader(comment({ status: "pending" }));
    expect(screen.getByTitle("Comment actions")).toBeInTheDocument();
  });
});
