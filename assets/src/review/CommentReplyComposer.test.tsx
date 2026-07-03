import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Comment } from "./types";

const stubCmd = { dispatch: vi.fn(), isPending: false };

vi.mock("./commands", () => ({
  useReviewCommands: () => ({
    resolveComment: stubCmd,
    reply: stubCmd,
  }),
}));

import { CommentReplyComposer } from "./CommentReplyComposer";

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    scope: "review",
    critique_type: "note",
    status: "published",
    body: "comment",
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

describe("CommentReplyComposer", () => {
  it("starts collapsed as a single-line reply box, not an open composer", () => {
    render(<CommentReplyComposer comment={comment()} />);

    // The collapsed box shows the placeholder but no multi-line textarea yet.
    expect(screen.getByText("Reply…")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("expands into the full composer when the reply box is clicked", () => {
    render(<CommentReplyComposer comment={comment()} />);

    fireEvent.click(screen.getByText("Reply…"));

    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("labels the expanded reply action as Unresolve for resolved comments", () => {
    render(<CommentReplyComposer comment={comment({ resolved: true })} />);

    fireEvent.click(screen.getByText("Reply to reopen this comment…"));

    expect(screen.getByRole("button", { name: "Unresolve" })).toBeInTheDocument();
  });

  it("explains that replying reopens a resolved comment", () => {
    render(<CommentReplyComposer comment={comment({ resolved: true })} />);

    expect(screen.getByTitle("Reply and reopen this comment")).toBeInTheDocument();
  });
});
