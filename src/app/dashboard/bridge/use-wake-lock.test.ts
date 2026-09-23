// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWakeLock } from "./use-wake-lock";

const release = vi.fn().mockResolvedValue(undefined);
const request = vi.fn().mockResolvedValue({ release });

function visibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

beforeEach(() => {
  request.mockClear();
  release.mockClear();
  visibility("visible");
  Object.defineProperty(navigator, "wakeLock", {
    value: { request },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWakeLock", () => {
  it("takes no lock while Bridge mode is off", () => {
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps the screen awake while Bridge mode is on", () => {
    renderHook(() => useWakeLock(true));
    expect(request).toHaveBeenCalledWith("screen");
  });

  it("re-acquires the lock when the tab comes back to the front", () => {
    renderHook(() => useWakeLock(true));
    request.mockClear();

    document.dispatchEvent(new Event("visibilitychange"));

    expect(request).toHaveBeenCalledWith("screen");
  });

  it("asks for no lock while the tab is hidden, since that always throws", () => {
    visibility("hidden");

    renderHook(() => useWakeLock(true));

    expect(request).not.toHaveBeenCalled();
  });

  it("takes the lock once a hidden tab is shown", () => {
    visibility("hidden");
    renderHook(() => useWakeLock(true));

    visibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(request).toHaveBeenCalledWith("screen");
  });

  it("survives a browser that refuses the lock", () => {
    request.mockRejectedValueOnce(new Error("denied"));
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it("releases the lock when Bridge mode goes off", async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    await Promise.resolve();

    unmount();
    await Promise.resolve();

    expect(release).toHaveBeenCalled();
  });
});
