import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CommentComposer } from "./CommentComposer";

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Controlled host so the body survives a rollback exactly as a real caller's. */
function Host(props: {
  onSubmit: (body: string) => Promise<unknown>;
  onSuccess?: () => void;
  initial?: string;
}) {
  const [body, setBody] = useState(props.initial ?? "");
  return (
    <CommentComposer
      value={body}
      onChange={setBody}
      onSubmit={props.onSubmit}
      onSuccess={props.onSuccess}
      submitLabel="Save"
    />
  );
}

describe("CommentComposer", () => {
  it("optimistically shows the body while submitting, then confirms on success", async () => {
    const gate = deferred();
    const onSubmit = vi.fn(() => gate.promise);
    const onSuccess = vi.fn();
    render(<Host onSubmit={onSubmit} onSuccess={onSuccess} initial="ship it" />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Submitting: textarea gone, body rendered optimistically with a Saving hint.
    expect(onSubmit).toHaveBeenCalledWith("ship it");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(screen.getByText("ship it")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();

    gate.resolve(undefined);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("rolls back to editing with the text intact and an error when submit fails", async () => {
    const gate = deferred();
    const onSubmit = vi.fn(() => gate.promise);
    render(<Host onSubmit={onSubmit} initial="needs work" />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    gate.reject(new Error("Store is not connected"));

    // Back to editing: textarea restored with the original text, error surfaced.
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    expect(screen.getByRole("textbox")).toHaveValue("needs work");
    expect(screen.getByRole("alert")).toHaveTextContent("Store is not connected");
  });

  it("does not submit an empty body", () => {
    const onSubmit = vi.fn();
    render(<Host onSubmit={onSubmit} initial="   " />);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
