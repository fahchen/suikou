import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => {
  cleanup()
  // Components now persist last-good command replies to localStorage (SWR); clear
  // it so a cached board/structure from one test can't seed the next. Guarded
  // because node-environment suites (e.g. tree-sitter) have no localStorage.
  if (typeof localStorage !== "undefined") localStorage.clear()
})
