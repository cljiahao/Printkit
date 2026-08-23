import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 10000 });

// jsdom has no ResizeObserver — radix-ui primitives (e.g. RadioGroup) read
// element size via it on mount. A no-op stub is enough for DOM tests, which
// never assert on layout/size.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no scrollIntoView — radix-ui's Select scrolls the highlighted
// option into view when it opens. A no-op stub is enough for DOM tests.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView === "undefined"
) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
