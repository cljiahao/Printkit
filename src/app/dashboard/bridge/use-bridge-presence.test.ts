// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const trackMock = vi.fn().mockResolvedValue(undefined);
const untrackMock = vi.fn().mockResolvedValue(undefined);
const channelMock = {
  subscribe: vi.fn(),
  track: trackMock,
  untrack: untrackMock,
  unsubscribe: vi.fn(),
};
channelMock.subscribe.mockReturnValue(channelMock);
const channelFactory = vi.fn().mockReturnValue(channelMock);

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ channel: channelFactory }),
}));

const requestMock = vi
  .fn()
  .mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) });
vi.stubGlobal("navigator", { wakeLock: { request: requestMock } });

describe("useBridgePresence", () => {
  beforeEach(() => {
    channelFactory.mockClear();
    trackMock.mockClear();
    requestMock.mockClear();
  });

  it("does nothing when disabled", async () => {
    const { useBridgePresence } = await import("./use-bridge-presence");
    renderHook(() => useBridgePresence("vendor-1", "loc-1", false));
    expect(channelFactory).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("tracks presence on the location-scoped channel and acquires a wake lock when enabled", async () => {
    const { useBridgePresence } = await import("./use-bridge-presence");
    renderHook(() => useBridgePresence("vendor-1", "loc-1", true));

    await Promise.resolve();

    expect(channelFactory).toHaveBeenCalledWith(
      "printkit:presence:vendor-1:loc-1",
      {
        config: { presence: { key: "bridge" } },
      },
    );
    expect(requestMock).toHaveBeenCalledWith("screen");
  });
});
