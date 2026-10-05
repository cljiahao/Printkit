// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const requestDeviceMock = vi.fn();

vi.stubGlobal("navigator", {
  bluetooth: { requestDevice: requestDeviceMock },
});

const connectMock = vi.fn().mockResolvedValue({ deviceName: "B1", result: 0 });
const printInitMock = vi.fn().mockResolvedValue(undefined);
const printPageMock = vi.fn().mockResolvedValue(undefined);
const waitForPageFinishedMock = vi.fn().mockResolvedValue(undefined);
const waitForFinishedMock = vi.fn().mockResolvedValue(undefined);
const printEndMock = vi.fn().mockResolvedValue(true);
const newPrintTaskMock = vi.fn().mockReturnValue({
  printInit: printInitMock,
  printPage: printPageMock,
  waitForPageFinished: waitForPageFinishedMock,
  waitForFinished: waitForFinishedMock,
  printEnd: printEndMock,
});
const disconnectMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@mmote/niimbluelib", () => ({
  NiimbotBluetoothClient: vi.fn().mockImplementation(function () {
    return {
      connect: connectMock,
      disconnect: disconnectMock,
      abstraction: { newPrintTask: newPrintTaskMock },
    };
  }),
  ImageEncoder: {
    encodeCanvas: vi
      .fn()
      .mockReturnValue({ cols: 384, rows: 240, rowsData: [] }),
  },
}));

import { connectPrinter, printLabel, disconnectPrinter } from "./niimbot-print";
import { ImageEncoder } from "@mmote/niimbluelib";

describe("connectPrinter", () => {
  it("constructs a NiimbotBluetoothClient and connects it", async () => {
    const client = await connectPrinter();
    expect(connectMock).toHaveBeenCalled();
    expect(client).toBeDefined();
  });
});

describe("printLabel", () => {
  beforeEach(() => {
    printInitMock.mockClear();
    printPageMock.mockClear();
    waitForPageFinishedMock.mockClear();
    waitForFinishedMock.mockClear();
    printEndMock.mockClear();
    newPrintTaskMock.mockClear();
  });

  it("encodes the canvas with printDirection 'top' (B1's real orientation)", async () => {
    const client = await connectPrinter();
    const canvas = document.createElement("canvas");

    await printLabel(client, canvas, 1);

    expect(ImageEncoder.encodeCanvas).toHaveBeenCalledWith(canvas, "top");
  });

  it("creates a B1 print task and runs the full print sequence in order", async () => {
    const client = await connectPrinter();
    const canvas = document.createElement("canvas");

    await printLabel(client, canvas, 2);

    expect(newPrintTaskMock).toHaveBeenCalledWith("B1", { totalPages: 2 });
    expect(printInitMock).toHaveBeenCalled();
    expect(printPageMock).toHaveBeenCalledWith(
      { cols: 384, rows: 240, rowsData: [] },
      2,
    );
    expect(waitForPageFinishedMock).toHaveBeenCalled();
    expect(waitForFinishedMock).toHaveBeenCalled();
    expect(printEndMock).toHaveBeenCalled();
  });

  it("accepts an explicit model and looks up its own printDirection, not a hardcoded one", async () => {
    const client = await connectPrinter();
    const canvas = document.createElement("canvas");

    await printLabel(client, canvas, 1, "B1");

    expect(ImageEncoder.encodeCanvas).toHaveBeenCalledWith(canvas, "top");
    expect(newPrintTaskMock).toHaveBeenCalledWith("B1", { totalPages: 1 });
  });

  it("counts a label as printed when the printer never acknowledges it", async () => {
    const client = await connectPrinter();
    waitForPageFinishedMock.mockRejectedValueOnce(
      new Error("Timeout waiting response (waited for de, df, dd, d9)"),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const canvas = document.createElement("canvas");

    await expect(printLabel(client, canvas)).resolves.toBeUndefined();
    expect(printPageMock).toHaveBeenCalled();
  });

  it("still fails when the printer rejects the page itself", async () => {
    const client = await connectPrinter();
    printPageMock.mockRejectedValueOnce(new Error("Timeout waiting response"));
    const canvas = document.createElement("canvas");

    await expect(printLabel(client, canvas)).rejects.toThrow(
      "Timeout waiting response",
    );
  });

  it("still fails on any other error while waiting", async () => {
    const client = await connectPrinter();
    waitForFinishedMock.mockRejectedValueOnce(new Error("out of paper"));
    const canvas = document.createElement("canvas");

    await expect(printLabel(client, canvas)).rejects.toThrow("out of paper");
  });

  it("does not fail the label when closing the job fails", async () => {
    const client = await connectPrinter();
    printEndMock.mockRejectedValueOnce(new Error("Timeout waiting response"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const canvas = document.createElement("canvas");

    await expect(printLabel(client, canvas)).resolves.toBeUndefined();
  });

  it("still calls printEnd when a print step throws (cleanup on failure)", async () => {
    const client = await connectPrinter();
    printPageMock.mockRejectedValueOnce(new Error("printer jammed"));
    const canvas = document.createElement("canvas");

    await expect(printLabel(client, canvas)).rejects.toThrow("printer jammed");
    expect(printEndMock).toHaveBeenCalled();
  });
});

describe("disconnectPrinter", () => {
  it("calls client.disconnect()", async () => {
    const client = await connectPrinter();
    await disconnectPrinter(client);
    expect(disconnectMock).toHaveBeenCalled();
  });
});
