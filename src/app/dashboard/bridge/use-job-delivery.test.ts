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
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  state: "joined",
};
channelMock.subscribe.mockReturnValue(channelMock);
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

  it("subscribes to postgres_changes on print_jobs, filtered to the location", () => {
    renderHook(() => useJobDelivery("vendor-1", "loc-1", vi.fn()));

    expect(channelFactory).toHaveBeenCalledWith(
      "printkit:job-delivery:vendor-1:loc-1",
    );
    expect(channelMock.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "*",
        schema: "printkit",
        table: "print_jobs",
        filter: "location_id=eq.loc-1",
      },
      expect.any(Function),
    );
  });

  it("calls onJobQueued with the job id, payload, and job_type when a row arrives with status 'queued'", () => {
    const onJobQueued = vi.fn();
    renderHook(() => useJobDelivery("vendor-1", "loc-1", onJobQueued));

    changeCallback?.({
      schema: "printkit",
      table: "print_jobs",
      commit_timestamp: "2026-08-22T00:00:00Z",
      errors: [],
      eventType: "UPDATE",
      new: {
        id: "job-1",
        status: "queued",
        payload: { customer_name: "Ada", order_number: "0007" },
        job_type: "label",
      },
      old: {},
    });

    expect(onJobQueued).toHaveBeenCalledWith(
      "job-1",
      { customer_name: "Ada", order_number: "0007" },
      "label",
    );
  });

  it("defaults job_type to 'label' when the row doesn't carry one", () => {
    const onJobQueued = vi.fn();
    renderHook(() => useJobDelivery("vendor-1", "loc-1", onJobQueued));

    changeCallback?.({
      schema: "printkit",
      table: "print_jobs",
      commit_timestamp: "2026-08-22T00:00:00Z",
      errors: [],
      eventType: "UPDATE",
      new: {
        id: "job-1",
        status: "queued",
        payload: { customer_name: "Ada", order_number: "0007" },
      },
      old: {},
    });

    expect(onJobQueued).toHaveBeenCalledWith(
      "job-1",
      { customer_name: "Ada", order_number: "0007" },
      "label",
    );
  });

  it("ignores a change whose row has no payload field", () => {
    const onJobQueued = vi.fn();
    renderHook(() => useJobDelivery("vendor-1", "loc-1", onJobQueued));

    changeCallback?.({
      schema: "printkit",
      table: "print_jobs",
      commit_timestamp: "2026-08-22T00:00:00Z",
      errors: [],
      eventType: "UPDATE",
      new: { id: "job-1", status: "queued" },
      old: {},
    });

    expect(onJobQueued).not.toHaveBeenCalled();
  });

  it("ignores a change whose new status isn't 'queued'", () => {
    const onJobQueued = vi.fn();
    renderHook(() => useJobDelivery("vendor-1", "loc-1", onJobQueued));

    changeCallback?.({
      schema: "printkit",
      table: "print_jobs",
      commit_timestamp: "2026-08-22T00:00:00Z",
      errors: [],
      eventType: "UPDATE",
      new: { id: "job-1", status: "printed" },
      old: { status: "pending" },
    });

    expect(onJobQueued).not.toHaveBeenCalled();
  });

  it("ignores a DELETE event whose payload.new is empty", () => {
    const onJobQueued = vi.fn();
    renderHook(() => useJobDelivery("vendor-1", "loc-1", onJobQueued));

    changeCallback?.({
      schema: "printkit",
      table: "print_jobs",
      commit_timestamp: "2026-08-22T00:00:00Z",
      errors: [],
      eventType: "DELETE",
      new: {},
      old: { id: "job-1", status: "queued" },
    });

    expect(onJobQueued).not.toHaveBeenCalled();
  });
});
