// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

let changeCallback: ((payload: unknown) => void) | undefined;
const channelMock = {
  on: vi.fn(function (
    this: unknown,
    _event: string,
    _opts: unknown,
    cb: (payload: unknown) => void,
  ) {
    changeCallback = cb;
    return channelMock;
  }),
  unsubscribe: vi.fn(),
  state: "joined",
} as any;
channelMock.subscribe = vi.fn().mockReturnValue(channelMock);
const channelFactory = vi.fn().mockReturnValue(channelMock);

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ channel: channelFactory }),
}));

import { useJobDelivery } from "./use-job-delivery";

describe("useJobDelivery", () => {
  beforeEach(() => {
    channelFactory.mockClear();
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
    channelMock.unsubscribe.mockClear();
    changeCallback = undefined;
  });

  it("subscribes to postgres_changes on print_jobs, filtered to the vendor", () => {
    renderHook(() => useJobDelivery("vendor-1", vi.fn()));

    expect(channelFactory).toHaveBeenCalledWith(
      "printkit:job-delivery:vendor-1",
    );
    expect(channelMock.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "*",
        schema: "printkit",
        table: "print_jobs",
        filter: "vendor_id=eq.vendor-1",
      },
      expect.any(Function),
    );
  });

  it("calls onJobQueued with the job id when a row arrives with status 'queued'", () => {
    const onJobQueued = vi.fn();
    renderHook(() => useJobDelivery("vendor-1", onJobQueued));

    changeCallback?.({ new: { id: "job-1", status: "queued" } });

    expect(onJobQueued).toHaveBeenCalledWith("job-1");
  });

  it("ignores a change whose new status isn't 'queued'", () => {
    const onJobQueued = vi.fn();
    renderHook(() => useJobDelivery("vendor-1", onJobQueued));

    changeCallback?.({ new: { id: "job-1", status: "printed" } });

    expect(onJobQueued).not.toHaveBeenCalled();
  });
});
