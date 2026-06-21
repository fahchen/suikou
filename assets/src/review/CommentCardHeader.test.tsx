import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
    drifted: false,
    authored_round: 0,
    inserted_at: new Date().toISOString(),
    anchor: null,
    replies: [],
    ...overrides,
  };
}

function renderHeader(c: Comment, opts: { inline?: boolean; drifted?: boolean } = {}) {
  return render(
    <Collapsible open>
      <CommentCardHeader
        comment={c}
        inline={opts.inline ?? false}
        open
        drifted={opts.drifted ?? false}
        onEdit={() => {}}
      />
    </Collapsible>,
  );
}

describe("CommentCardHeader", () => {
  it("shows Edit for a pending comment", () => {
    renderHeader(comment({ status: "pending" }));
    fireEvent.click(screen.getByTitle("Comment actions"));
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("omits Edit for a published comment", () => {
    renderHeader(comment({ status: "published" }));
    fireEvent.click(screen.getByTitle("Comment actions"));
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

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

  it("shows no unlink icon for a file-level (null anchor) comment", () => {
    renderHeader(comment({ anchor: null }));
    expect(screen.queryByLabelText("No anchor")).not.toBeInTheDocument();
  });

  it("shows the drift marker in both rail and inline contexts", () => {
    renderHeader(
      comment({ anchor: { type: "line_range", start_line: 2, end_line: 2, quote: "x" } }),
      { drifted: true },
    );
    expect(screen.getByLabelText("Re-anchored to a similar line")).toBeInTheDocument();

    renderHeader(
      comment({ anchor: { type: "line_range", start_line: 2, end_line: 2, quote: "x" } }),
      { inline: true, drifted: true },
    );
    expect(screen.getAllByLabelText("Re-anchored to a similar line").length).toBeGreaterThan(0);
  });

  it("omits the drift marker when not drifted", () => {
    renderHeader(comment({ anchor: { type: "line_range", start_line: 2, end_line: 2, quote: "x" } }));
    expect(screen.queryByLabelText("Re-anchored to a similar line")).not.toBeInTheDocument();
  });
});
