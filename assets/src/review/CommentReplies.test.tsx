import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Reply } from "./types";

const commands = {
  editReply: { dispatch: vi.fn(), isPending: false },
  deleteReply: { dispatch: vi.fn(), isPending: false },
};

vi.mock("./commands", () => ({
  useReviewCommands: () => commands,
}));

import { CommentReplies } from "./CommentReplies";

function reply(overrides: Partial<Reply> = {}): Reply {
  return {
    id: "r1",
    author: "human",
    status: "pending",
    body: "draft reply",
    inserted_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("CommentReplies", () => {
  it("shows edit and delete only for a human pending reply", () => {
    render(
      <CommentReplies
        replies={[
          reply(),
          reply({ id: "r2", status: "published" }),
          reply({ id: "r3", author: "agent", status: "published" }),
        ]}
      />,
    );

    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getAllByText("You")).toHaveLength(2);
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("edits a human pending reply inline", () => {
    render(<CommentReplies replies={[reply()]} />);

    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "revised reply" } });
    fireEvent.click(screen.getByText("Save"));

    expect(commands.editReply.dispatch).toHaveBeenCalledWith({
      reply_id: "r1",
      body: "revised reply",
    });
  });

  it("deletes a human pending reply", () => {
    render(<CommentReplies replies={[reply()]} />);

    fireEvent.click(screen.getByText("Delete"));

    expect(commands.deleteReply.dispatch).toHaveBeenCalledWith({
      reply_id: "r1",
    });
  });
});
