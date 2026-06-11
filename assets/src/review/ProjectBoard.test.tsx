import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const dispatch = vi.fn();
let snapshot: unknown;

vi.mock("../musubi", () => ({
  useMusubiRoot: () => ({ status: "ok", store: {} }),
  useMusubiSnapshot: () => snapshot,
  useMusubiCommand: () => ({ dispatch, isPending: false }),
}));

import { ProjectBoard } from "./ProjectBoard";

beforeEach(() => {
  dispatch.mockReset();
  snapshot = {
    projects: [
      {
        id: "p1",
        name: "Data Platform",
        files: [
          { path: "draft.md", artifact_id: null },
          { path: "design.md", artifact_id: "a-99" },
        ],
      },
    ],
  };
});

describe("ProjectBoard", () => {
  it("lists each project with its files", () => {
    render(<ProjectBoard onOpen={vi.fn()} />);

    expect(screen.getByText("Data Platform")).toBeInTheDocument();
    expect(screen.getByText("draft.md")).toBeInTheDocument();
    expect(screen.getByText("design.md")).toBeInTheDocument();
  });

  it("opens an already-started file without minting a new artifact", () => {
    const onOpen = vi.fn();
    render(<ProjectBoard onOpen={onOpen} />);

    fireEvent.click(screen.getByText("design.md"));

    expect(dispatch).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledWith("a-99");
  });

  it("mints an artifact for an unstarted file, then opens it", async () => {
    dispatch.mockResolvedValue({ artifact_id: "a-new", error: null });
    const onOpen = vi.fn();
    render(<ProjectBoard onOpen={onOpen} />);

    fireEvent.click(screen.getByText("draft.md"));

    expect(dispatch).toHaveBeenCalledWith({ project_id: "p1", file_path: "draft.md" });
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("a-new"));
  });

  it("surfaces a reply error and does not open", async () => {
    dispatch.mockResolvedValue({ artifact_id: null, error: "empty_content" });
    const onOpen = vi.fn();
    render(<ProjectBoard onOpen={onOpen} />);

    fireEvent.click(screen.getByText("draft.md"));

    await waitFor(() => expect(screen.getByText("empty_content")).toBeInTheDocument());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("shows an empty state when no project is registered", () => {
    snapshot = { projects: [] };
    render(<ProjectBoard onOpen={vi.fn()} />);

    expect(screen.getByText(/No projects yet/)).toBeInTheDocument();
  });

  it("creates a project from the working directory and name", async () => {
    dispatch.mockResolvedValue({ project_id: "p-new", error: null });
    render(<ProjectBoard onOpen={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Docs" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Working directory/), {
      target: { value: "/tmp/docs" },
    });
    fireEvent.click(screen.getByText("Create project"));

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ name: "Docs", path: "/tmp/docs" }),
    );
  });

  it("surfaces a create-project error", async () => {
    dispatch.mockResolvedValue({ project_id: null, error: "not_a_directory" });
    render(<ProjectBoard onOpen={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Docs" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Working directory/), {
      target: { value: "/no/such/dir" },
    });
    fireEvent.click(screen.getByText("Create project"));

    await waitFor(() => expect(screen.getByText("not_a_directory")).toBeInTheDocument());
  });
});
