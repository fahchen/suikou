import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Comment } from "./types";

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
  it("labels the reply action as Unresolve for resolved comments", () => {
    render(<CommentReplyComposer comment={comment({ resolved: true })} />);

    expect(screen.getByText("Unresolve")).toBeInTheDocument();
  });

  it("explains that replying reopens a resolved comment", () => {
    render(<CommentReplyComposer comment={comment({ resolved: true })} />);

    expect(screen.getByTitle("Reply and reopen this comment")).toBeInTheDocument();
  });
});
