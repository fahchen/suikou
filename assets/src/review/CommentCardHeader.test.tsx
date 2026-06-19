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
    scope: "located",
    critique_type: "note",
    status: "pending",
    body: "body",
    resolved: false,
    resolved_round: null,
    outdated: false,
    authored_round: 0,
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
  it("shows the actions menu for a pending comment", () => {
    renderHeader(comment({ status: "pending" }));
    expect(screen.getByTitle("Comment actions")).toBeInTheDocument();
  });

  it("shows the actions menu for a published comment", () => {
    renderHeader(comment({ status: "published" }));
    expect(screen.getByTitle("Comment actions")).toBeInTheDocument();
  });

  it("renders a Resolved badge when comment.resolved is true", () => {
    renderHeader(comment({ status: "published", resolved: true }));
    expect(screen.getByLabelText("Resolved")).toBeInTheDocument();
  });

  it("omits the Resolved badge when the comment is unresolved", () => {
    renderHeader(comment({ status: "published", resolved: false }));
    expect(screen.queryByLabelText("Resolved")).not.toBeInTheDocument();
  });
});
