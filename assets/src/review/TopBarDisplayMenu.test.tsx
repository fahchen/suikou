import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import type { ViewCapabilities } from "./view-kind";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => () => undefined,
}));

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

import { TopBarDisplayMenu } from "./TopBarDisplayMenu";

const capabilities: ViewCapabilities = {
  diffLayout: false,
  rawToggle: false,
  markdownFlavor: false,
  wrapLines: false,
  density: false,
  comments: true,
};

function renderMenu(sideCommentsAllowed: boolean) {
  return render(
    <TopBarDisplayMenu
      reviewId="r-1"
      filePath="docs/plan.md"
      rawView={false}
      capabilities={capabilities}
      viewKind="file"
      diffLayoutAllowed={false}
      sideCommentsAllowed={sideCommentsAllowed}
    />,
  );
}

describe("TopBarDisplayMenu comments mode", () => {
  it("offers the Side toggle when the side rail has room", () => {
    renderMenu(true);
    fireEvent.click(screen.getByTitle("Display settings"));
    expect(screen.getByText("Side")).toBeInTheDocument();
  });

  it("hides the Side toggle below the breakpoint so the control is never dead", () => {
    renderMenu(false);
    fireEvent.click(screen.getByTitle("Display settings"));
    expect(screen.getByText("Inline")).toBeInTheDocument();
    expect(screen.queryByText("Side")).not.toBeInTheDocument();
  });
});
