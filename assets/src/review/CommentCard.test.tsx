import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Comment } from "./types";

// CommentReplyComposer reads matchMedia via useMediaQuery; jsdom omits it.
beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

const stubCmd = { dispatch: vi.fn(), isPending: false };

vi.mock("./commands", () => ({
  useReviewCommands: () => ({
    addComment: stubCmd,
    editComment: stubCmd,
    deleteComment: stubCmd,
    resolveComment: stubCmd,
    unresolveComment: stubCmd,
    reply: stubCmd,
    submitReview: stubCmd,
    setDraftVerdict: stubCmd,
    selectRound: stubCmd,
  }),
}));

import { CommentCard } from "./CommentCard";

function comment(overrides: Partial<Comment>): Comment {
  return {
    id: "c1",
    scope: "located",
    critique_type: "note",
    status: "published",
    body: "the comment body",
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

describe("CommentCard", () => {
  it("auto-collapses when the comment transitions to resolved without remount", () => {
    const initial = comment({ resolved: false });
    const { rerender } = render(<CommentCard comment={initial} context="inline" />);

    // Body present (Collapsible content rendered) while unresolved.
    expect(screen.getByText("the comment body")).toBeInTheDocument();
    expect(screen.getByLabelText("Collapse comment")).toBeInTheDocument();

    rerender(<CommentCard comment={{ ...initial, resolved: true }} context="inline" />);

    // Header switches to "Expand comment" once the card collapses.
    expect(screen.getByLabelText("Expand comment")).toBeInTheDocument();
    expect(screen.getByLabelText("Resolved")).toBeInTheDocument();
  });

  it("does not auto-expand when a resolved comment transitions back to unresolved", () => {
    const initial = comment({ resolved: true });
    const { rerender } = render(<CommentCard comment={initial} context="inline" />);

    // Starts collapsed because resolved seeds open=false.
    expect(screen.getByLabelText("Expand comment")).toBeInTheDocument();

    rerender(<CommentCard comment={{ ...initial, resolved: false }} context="inline" />);

    // Still collapsed — the user's open state is preserved on unresolve.
    expect(screen.getByLabelText("Expand comment")).toBeInTheDocument();
    expect(screen.queryByLabelText("Resolved")).not.toBeInTheDocument();
  });
});
