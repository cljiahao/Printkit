import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/vendor-session", () => ({
  getVendorSession: () => Promise.resolve({ user: { id: "vendor-1" } }),
}));

const getPrinterByLocationMock = vi.fn();
const createPrinterMock = vi.fn();
vi.mock("@/lib/printers", () => ({
  getPrinterByLocation: (...args: unknown[]) =>
    getPrinterByLocationMock(...args),
  createPrinter: (...args: unknown[]) => createPrinterMock(...args),
  printerState: (lastSeen: string | null) => (lastSeen ? "online" : "offline"),
}));

const mintDeviceCredentialMock = vi.fn();
vi.mock("@/lib/device-credentials", () => ({
  mintDeviceCredential: (...args: unknown[]) =>
    mintDeviceCredentialMock(...args),
}));

const createPairingCodeMock = vi.fn();
vi.mock("@/lib/bridge-pairing", () => ({
  createPairingCode: (...args: unknown[]) => createPairingCodeMock(...args),
  formatPairingCode: (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`,
}));

const registerPrinterMock = vi.fn();
const queryPrinterMock = vi.fn();
vi.mock("@/lib/connectors/vendor-cloud/drivers", () => ({
  getVendorCloudDriver: (id: string) =>
    id === "feie"
      ? { registerPrinter: registerPrinterMock, queryPrinter: queryPrinterMock }
      : null,
}));

let siteUrl: string | null = "https://printkit.test";
vi.mock("@/lib/site-url", () => ({ publicSiteUrl: () => siteUrl }));

let ownsLocation = true;
let updateError: { message: string } | null = null;
const updateMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: (table: string) => {
        if (table === "printers") {
          return {
            update: (values: unknown) => {
              updateMock(values);
              return {
                eq: () => Promise.resolve({ error: updateError }),
              };
            },
          };
        }
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () =>
            Promise.resolve({ data: ownsLocation ? { id: "loc-1" } : null }),
        };
        return query;
      },
    }),
}));

import {
  createPrinterUrl,
  registerBrandCloudPrinter,
  createBridgePairingCode,
  readPrinterState,
} from "./actions";

const starPrinter = {
  id: "printer-1",
  catalog_id: "star-mc-label2",
  display_name: "Star mC-Label2",
  last_seen_at: null,
};

beforeEach(() => {
  ownsLocation = true;
  siteUrl = "https://printkit.test";
  updateError = null;
  getPrinterByLocationMock.mockReset().mockResolvedValue(null);
  createPrinterMock.mockReset().mockResolvedValue(starPrinter);
  mintDeviceCredentialMock.mockReset().mockResolvedValue("device-token");
  createPairingCodeMock.mockReset().mockResolvedValue("ABCD2345");
  registerPrinterMock.mockReset();
  queryPrinterMock.mockReset().mockResolvedValue("online");
  updateMock.mockReset();
});

describe("createPrinterUrl", () => {
  it("creates the printer and returns its absolute address", async () => {
    const result = await createPrinterUrl("loc-1", "star-mc-label2");

    expect(createPrinterMock).toHaveBeenCalledWith({
      vendorId: "vendor-1",
      locationId: "loc-1",
      catalogId: "star-mc-label2",
    });
    expect(mintDeviceCredentialMock).toHaveBeenCalledWith(
      "printer-1",
      "cloudprnt_url_token",
    );
    expect(result).toEqual({
      ok: true,
      url: "https://printkit.test/api/cloudprnt/device-token",
    });
  });

  it("reuses the booth's printer when it is the same model", async () => {
    getPrinterByLocationMock.mockResolvedValue(starPrinter);

    await createPrinterUrl("loc-1", "star-mc-label2");

    expect(createPrinterMock).not.toHaveBeenCalled();
  });

  it("refuses another vendor's booth", async () => {
    ownsLocation = false;

    const result = await createPrinterUrl("loc-9", "star-mc-label2");

    expect(result.ok).toBe(false);
    expect(mintDeviceCredentialMock).not.toHaveBeenCalled();
  });

  it("refuses a booth that already has a different printer", async () => {
    getPrinterByLocationMock.mockResolvedValue({
      ...starPrinter,
      catalog_id: "feie-fp-n20h",
    });

    const result = await createPrinterUrl("loc-1", "star-mc-label2");

    expect(result).toEqual({
      ok: false,
      error: "That booth already has a different printer. Remove it first.",
    });
  });

  it("mints nothing when printkit does not know its own address", async () => {
    siteUrl = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await createPrinterUrl("loc-1", "star-mc-label2");

    expect(result.ok).toBe(false);
    expect(mintDeviceCredentialMock).not.toHaveBeenCalled();
  });

  it("fails when the credential cannot be minted", async () => {
    mintDeviceCredentialMock.mockResolvedValue(null);

    expect((await createPrinterUrl("loc-1", "star-mc-label2")).ok).toBe(false);
  });
});

describe("registerBrandCloudPrinter", () => {
  const feiePrinter = {
    ...starPrinter,
    catalog_id: "feie-fp-n20h",
    display_name: "Feie FP-N20H",
  };

  beforeEach(() => {
    createPrinterMock.mockResolvedValue(feiePrinter);
  });

  it("registers with the maker, saves the SN and reports the state", async () => {
    registerPrinterMock.mockResolvedValue({ ok: true, deviceRef: "SN1" });

    const result = await registerBrandCloudPrinter(
      "loc-1",
      "feie-fp-n20h",
      "SN1",
      "KEY1",
    );

    expect(registerPrinterMock).toHaveBeenCalledWith({
      sn: "SN1",
      key: "KEY1",
      name: "Feie FP-N20H",
    });
    expect(updateMock).toHaveBeenCalledWith({ device_ref: "SN1" });
    expect(result).toEqual({ ok: true, state: "online" });
  });

  it("passes the maker's refusal through and saves nothing", async () => {
    registerPrinterMock.mockResolvedValue({
      ok: false,
      error: "The printer rejected that KEY.",
    });

    const result = await registerBrandCloudPrinter(
      "loc-1",
      "feie-fp-n20h",
      "SN1",
      "BAD",
    );

    expect(result).toEqual({
      ok: false,
      error: "The printer rejected that KEY.",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses a model with no brand-cloud driver", async () => {
    const result = await registerBrandCloudPrinter(
      "loc-1",
      "star-mc-label2",
      "SN1",
      "KEY1",
    );

    expect(result).toEqual({
      ok: false,
      error: "That printer is not supported yet.",
    });
  });

  it("refuses another vendor's booth", async () => {
    ownsLocation = false;

    const result = await registerBrandCloudPrinter(
      "loc-9",
      "feie-fp-n20h",
      "SN1",
      "KEY1",
    );

    expect(result.ok).toBe(false);
    expect(registerPrinterMock).not.toHaveBeenCalled();
  });

  it("refuses a booth that already has a different printer", async () => {
    getPrinterByLocationMock.mockResolvedValue(starPrinter);

    const result = await registerBrandCloudPrinter(
      "loc-1",
      "feie-fp-n20h",
      "SN1",
      "KEY1",
    );

    expect(result.ok).toBe(false);
    expect(registerPrinterMock).not.toHaveBeenCalled();
  });

  it("fails when the SN cannot be saved", async () => {
    registerPrinterMock.mockResolvedValue({ ok: true, deviceRef: "SN1" });
    updateError = { message: "boom" };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await registerBrandCloudPrinter(
      "loc-1",
      "feie-fp-n20h",
      "SN1",
      "KEY1",
    );

    expect(result).toEqual({ ok: false, error: "Could not save the printer." });
  });
});

describe("createBridgePairingCode", () => {
  beforeEach(() => {
    createPrinterMock.mockResolvedValue({
      ...starPrinter,
      catalog_id: "niimbot-b1",
    });
  });

  it("returns a formatted single-use code", async () => {
    expect(await createBridgePairingCode("loc-1")).toEqual({
      ok: true,
      code: "ABCD-2345",
    });
  });

  it("refuses another vendor's booth", async () => {
    ownsLocation = false;

    expect((await createBridgePairingCode("loc-9")).ok).toBe(false);
    expect(createPairingCodeMock).not.toHaveBeenCalled();
  });

  it("refuses a booth that already has a different printer", async () => {
    getPrinterByLocationMock.mockResolvedValue(starPrinter);

    expect((await createBridgePairingCode("loc-1")).ok).toBe(false);
  });

  it("fails when no code could be created", async () => {
    createPairingCodeMock.mockResolvedValue(null);

    expect(await createBridgePairingCode("loc-1")).toEqual({
      ok: false,
      error: "Could not create a pairing code.",
    });
  });
});

describe("readPrinterState", () => {
  it("reports the booth's printer state", async () => {
    getPrinterByLocationMock.mockResolvedValue({
      ...starPrinter,
      last_seen_at: "2026-09-22T00:00:00.000Z",
    });

    expect(await readPrinterState("loc-1")).toBe("online");
  });

  it("reports not set up for a booth with no printer", async () => {
    expect(await readPrinterState("loc-1")).toBe("not_set_up");
  });

  it("reveals nothing about another vendor's booth", async () => {
    ownsLocation = false;
    getPrinterByLocationMock.mockResolvedValue(starPrinter);

    expect(await readPrinterState("loc-9")).toBe("not_set_up");
  });
});
