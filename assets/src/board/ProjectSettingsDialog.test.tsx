import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

const dispatch = vi.fn(() => Promise.resolve({ error: null }))

vi.mock("../musubi", () => ({
  useMusubiCommand: () => ({ dispatch, isPending: false }),
}))

import { ProjectSettingsDialog } from "./ProjectSettingsDialog"
import type { BoardProject, BoardStore } from "./types"

const project = {
  id: "project-1",
  name: "Suikou",
  path: "/tmp/suikou",
  respect_gitignore: true,
  emoji: null,
  review_instructions: null,
  reviews: [],
} as unknown as BoardProject

const store = {} as BoardStore

describe("ProjectSettingsDialog", () => {
  test("saves the review instructions the human typed", async () => {
    render(
      <ProjectSettingsDialog
        store={store}
        project={project}
        open
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText("e.g. Report any Repo call inside queries/."), {
      target: { value: "Report any Repo call inside queries/." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ review_instructions: "Report any Repo call inside queries/." }),
    )
  })

  test("sends null when the text area is emptied", () => {
    render(
      <ProjectSettingsDialog
        store={store}
        project={{ ...project, review_instructions: "Old text." }}
        open
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    fireEvent.change(screen.getByDisplayValue("Old text."), { target: { value: "  " } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ review_instructions: null }))
  })
})
