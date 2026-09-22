import { describe, it, expect, vi, beforeEach } from "vitest";

const getPrinterByTokenHashMock = vi.fn();
vi.mock("@/lib/printers", () => ({
  getPrinterByTokenHash: (...args: unknown[]) =>
    getPrinterByTokenHashMock(...args),
}));

import { resolveAgent } from "./agent-auth";
import { hashDeviceToken } from "./device-credentials";

const printer = { id: "printer-1", connector: "bridge" };

function request(authorization?: string): Request {
  return new Request("https://printkit.test/api/v1/bridge-agent/next-job", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  getPrinterByTokenHashMock.mockReset().mockResolvedValue(printer);
});

describe("resolveAgent", () => {
  it("looks the printer up by the token's hash", async () => {
    await resolveAgent(request("Bearer agent-token"));

    expect(getPrinterByTokenHashMock).toHaveBeenCalledWith(
      hashDeviceToken("agent-token"),
    );
  });

  it("returns the agent's printer", async () => {
    expect(await resolveAgent(request("Bearer agent-token"))).toEqual(printer);
  });

  it("refuses a request with no authorization header", async () => {
    expect(await resolveAgent(request())).toBeNull();
    expect(getPrinterByTokenHashMock).not.toHaveBeenCalled();
  });

  it("refuses a non-bearer scheme", async () => {
    expect(await resolveAgent(request("Basic abc"))).toBeNull();
  });

  it("refuses an empty token", async () => {
    expect(await resolveAgent(request("Bearer   "))).toBeNull();
  });

  it("refuses an unknown token", async () => {
    getPrinterByTokenHashMock.mockResolvedValue(null);
    expect(await resolveAgent(request("Bearer nope"))).toBeNull();
  });

  it("refuses a token belonging to a printer on another connector", async () => {
    getPrinterByTokenHashMock.mockResolvedValue({
      id: "printer-2",
      connector: "cloud_poll",
    });
    expect(await resolveAgent(request("Bearer agent-token"))).toBeNull();
  });
});
