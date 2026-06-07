import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { uiStore } from "../stores/ui-store";

const dispatch = vi.fn();

vi.mock("./commands", () => ({
  useReviewCommands: () => ({
    addComment: { dispatch, isPending: false },
  }),
}));

import { Composer } from "./Composer";

beforeEach(() => {
  dispatch.mockReset();
  uiStore.openComposer(3, "line");
});

describe("Composer", () => {
  it("renders the target line range", () => {
    render(<Composer startLine={3} endLine={5} />);
    expect(screen.getByText(/lines 3-5/)).toBeInTheDocument();
  });

  it("disables Add comment while the draft is empty", () => {
    render(<Composer startLine={3} endLine={3} />);
    expect(screen.getByRole("button", { name: "Add comment" })).toBeDisabled();
  });

  it("dispatches add_comment with the draft and anchor, then closes", () => {
    render(<Composer startLine={3} endLine={5} />);

    fireEvent.change(screen.getByPlaceholderText(/Leave a comment/), {
      target: { value: "needs a fix" },
    });
    fireEvent.click(screen.getByRole("button", { name: "fix_required" }));
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));

    expect(dispatch).toHaveBeenCalledWith({
      scope: "line",
      critique_type: "fix_required",
      body: "needs a fix",
      start_line: 3,
      end_line: 5,
    });
    expect(uiStore.composerLine).toBeNull();
  });
});
