import { describe, it, expect, vi } from "vitest";
import { createBluetoothPrinter, loadNiimblue } from "./printer";

function fakeLibrary(taskFromPrinter: string | null = "B1") {
  const image = {
    flatten: vi.fn(() => image),
    threshold: vi.fn(() => image),
  };
  const client = {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    isConnected: vi.fn(() => true),
    getPrintTaskType: vi.fn(() => taskFromPrinter ?? undefined),
    getModelMetadata: vi.fn(() => ({ printDirection: "top" })),
  };
  const lib = {
    initClient: vi.fn(() => client),
    loadImageFromBase64: vi.fn(async () => image),
    ImageEncoder: { encodeImage: vi.fn(async () => "encoded") },
    printImages: vi.fn(async () => undefined),
  };
  return { lib, client, image };
}

const png = new Uint8Array([137, 80, 78, 71]);

describe("createBluetoothPrinter", () => {
  it("connects over BLE and prints one single-colour page", async () => {
    const { lib, client, image } = fakeLibrary();
    const printer = createBluetoothPrinter({
      address: "B1-H123",
      model: "B1",
      log: () => undefined,
      load: async () => lib,
    });

    await printer.print(png);

    expect(lib.initClient).toHaveBeenCalledWith("ble", "B1-H123", false);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(lib.loadImageFromBase64).toHaveBeenCalledWith(
      Buffer.from(png).toString("base64"),
    );
    expect(image.threshold).toHaveBeenCalledWith(128);
    expect(lib.ImageEncoder.encodeImage).toHaveBeenCalledWith(image, 0, "top");
    expect(lib.printImages).toHaveBeenCalledWith(
      client,
      "B1",
      [{ encoded: "encoded" }],
      { quantity: 1, labelType: 1, density: 3 },
    );
  });

  it("reuses a live connection between labels", async () => {
    const { lib, client } = fakeLibrary();
    const printer = createBluetoothPrinter({
      address: "B1-H123",
      model: "B1",
      log: () => undefined,
      load: async () => lib,
    });

    await printer.print(png);
    await printer.print(png);

    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("asks the printer for its model when none was chosen", async () => {
    const { lib, client } = fakeLibrary("D110");
    const printer = createBluetoothPrinter({
      address: "D110-1",
      model: "",
      log: () => undefined,
      load: async () => lib,
    });

    await printer.print(png);

    expect(lib.printImages).toHaveBeenCalledWith(
      client,
      "D110",
      expect.anything(),
      expect.anything(),
    );
  });

  it("fails clearly when the model cannot be told", async () => {
    const { lib } = fakeLibrary(null);
    const printer = createBluetoothPrinter({
      address: "X",
      model: "",
      log: () => undefined,
      load: async () => lib,
    });

    await expect(printer.print(png)).rejects.toThrow(/which NIIMBOT model/);
  });

  it("connects afresh after a reconnect", async () => {
    const { lib, client } = fakeLibrary();
    const printer = createBluetoothPrinter({
      address: "B1-H123",
      model: "B1",
      log: () => undefined,
      load: async () => lib,
    });

    await printer.print(png);
    await printer.reconnect();
    await printer.print(png);

    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(2);
  });
});

describe("loadNiimblue", () => {
  it("accepts the CommonJS exports under default", async () => {
    const { lib } = fakeLibrary();
    await expect(
      loadNiimblue(async () => ({ default: lib })),
    ).resolves.toMatchObject({ initClient: lib.initClient });
  });

  it("explains how to fix a missing library", async () => {
    await expect(
      loadNiimblue(async () => {
        throw new Error("Cannot find module");
      }),
    ).rejects.toThrow(/Run the installer on the Raspberry Pi/);
  });
});
