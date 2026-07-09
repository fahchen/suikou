import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

import { ConfirmDeleteIconButton } from "./CommentActions"

describe("ConfirmDeleteIconButton", () => {
  test("stays armed after the confirmation click", () => {
    const onConfirm = vi.fn()
    render(<ConfirmDeleteIconButton onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    const confirm = screen.getByRole("button", { name: "Confirm delete" })
    fireEvent.click(confirm)

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(confirm).toHaveAccessibleName("Confirm delete")
  })

  test("does not leak pointer interaction to a clickable parent while confirming", () => {
    const onConfirm = vi.fn()
    const onParentPointerDown = vi.fn()

    render(
      <div onPointerDown={onParentPointerDown}>
        <ConfirmDeleteIconButton onConfirm={onConfirm} />
      </div>,
    )

    const trigger = screen.getByRole("button", { name: "Delete" })
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)

    const confirm = screen.getByRole("button", { name: "Confirm delete" })
    fireEvent.pointerDown(confirm)
    fireEvent.click(confirm)

    expect(onParentPointerDown).not.toHaveBeenCalled()
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
