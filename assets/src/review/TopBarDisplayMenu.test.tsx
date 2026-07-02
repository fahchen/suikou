import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import type { ViewCapabilities } from "./view-kind";

const route = vi.hoisted(() => ({ pathname: "/reviews/r-1/files/docs/plan.md" }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => () => undefined,
  useRouterState: (opts: { select: (s: { location: { pathname: string } }) => unknown }) =>
    opts.select({ location: { pathname: route.pathname } }),
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
  sourceToggle: false,
  htmlInteraction: false,
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
      sourceView={false}
      capabilities={capabilities}
      viewKind="file"
      diffLayoutAllowed={false}
      sideCommentsAllowed={sideCommentsAllowed}
    />,
  );
}

describe("TopBarDisplayMenu file mode follows the route", () => {
  it("reads single on a file route — the all-files-only Reviewed row is hidden", () => {
    route.pathname = "/reviews/r-1/files/docs/plan.md";
    renderMenu(true);
    fireEvent.click(screen.getByTitle("Display settings"));
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });

  it("reads all on the index route — the Reviewed row shows", () => {
    route.pathname = "/reviews/r-1";
    renderMenu(true);
    fireEvent.click(screen.getByTitle("Display settings"));
    expect(screen.getByText("Reviewed")).toBeInTheDocument();
  });
});

describe("TopBarDisplayMenu comments mode", () => {
  beforeAll(() => {
    route.pathname = "/reviews/r-1/files/docs/plan.md";
  });

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
