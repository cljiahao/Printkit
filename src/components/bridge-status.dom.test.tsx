// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

let presenceCallback: (() => void) | undefined;
const presenceStateMock = vi.fn().mockReturnValue({});

const channelMock = {
  on: vi.fn(),
  subscribe: vi.fn(),
  presenceState: presenceStateMock,
  unsubscribe: vi.fn(),
};

channelMock.on.mockImplementation(function (
  this: unknown,
  event: string,
  opts: unknown,
  cb: () => void,
) {
  if (event === "presence") presenceCallback = cb;
  return channelMock;
});
channelMock.subscribe.mockReturnValue(channelMock);

const channelFactory = vi.fn().mockReturnValue(channelMock);

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ channel: channelFactory }),
}));

import { BridgeStatus } from "./bridge-status";

describe("BridgeStatus", () => {
  beforeEach(() => {
    channelFactory.mockClear();
    presenceStateMock.mockReset().mockReturnValue({});
  });

  it("subscribes to the location-scoped presence channel", () => {
    render(
      <BridgeStatus vendorId="vendor-1" locationId="loc-1" label="Main St" />,
    );
    expect(channelFactory).toHaveBeenCalledWith(
      "printkit:presence:vendor-1:loc-1",
    );
  });

  it("shows offline when presenceState has no bridge key", () => {
    render(
      <BridgeStatus vendorId="vendor-1" locationId="loc-1" label="Main St" />,
    );
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it("renders the location label", () => {
    render(
      <BridgeStatus vendorId="vendor-1" locationId="loc-1" label="Main St" />,
    );
    expect(screen.getByText(/Main St/)).toBeInTheDocument();
  });

  it("shows online once the presence sync callback fires with a bridge key present", async () => {
    presenceStateMock.mockReturnValue({});
    render(
      <BridgeStatus vendorId="vendor-1" locationId="loc-1" label="Main St" />,
    );

    presenceStateMock.mockReturnValue({ bridge: [{ online: true }] });
    presenceCallback?.();

    await waitFor(() =>
      expect(screen.getByText(/online/i)).toBeInTheDocument(),
    );
  });
});
