import type { LabelPrinter } from "./loop.js";

type NiimblueNode = {
  NiimbotHeadlessBluetoothClient: new () => {
    connect: (address: string) => Promise<void>;
    disconnect: () => Promise<void>;
    abstraction: unknown;
  };
  printImage?: unknown;
};

/**
 * Named indirectly so the specifier is resolved at run time rather than
 * build time: the Bluetooth stack is a compiled native module that only
 * exists on the Pi, and printkit's own repo neither installs nor
 * typechecks against it.
 */
const NIIMBLUE_MODULE = "@mmote/niimblue-node";

/**
 * Loaded at call time, not at import, so the CLI's other commands (pair,
 * use, help) still run on a machine without the native module.
 */
async function loadNiimblue(): Promise<NiimblueNode> {
  const mod: unknown = await import(NIIMBLUE_MODULE);
  if (
    typeof mod !== "object" ||
    mod === null ||
    !("NiimbotHeadlessBluetoothClient" in mod)
  ) {
    throw new Error(
      "The Bluetooth printer library is not installed. Run the installer on the Raspberry Pi.",
    );
  }
  return mod as NiimblueNode;
}

export type BluetoothPrinterOptions = {
  address: string;
  model: string;
  log: (message: string) => void;
};

/**
 * A NIIMBOT printer reachable over Bluetooth from a Raspberry Pi. Printing
 * is one image at a time, and a failure is surfaced rather than retried,
 * matching what the Android bridge does.
 *
 * Unverified on real hardware: the upstream library documents Windows and
 * macOS, not Linux, so this is gated behind the hardware test before the
 * catalog marks the B1 verified.
 */
export function createBluetoothPrinter(
  options: BluetoothPrinterOptions,
): LabelPrinter {
  let client: { disconnect: () => Promise<void> } | null = null;

  const connect = async () => {
    const { NiimbotHeadlessBluetoothClient } = await loadNiimblue();
    const next = new NiimbotHeadlessBluetoothClient();
    await next.connect(options.address);
    client = next;
    options.log(`Connected to ${options.address}`);
    return next;
  };

  return {
    async print(png: Uint8Array): Promise<void> {
      const active = client ?? (await connect());
      const printImage = (await loadNiimblue()).printImage;
      if (typeof printImage !== "function") {
        throw new Error("The Bluetooth printer library cannot print images.");
      }
      await (
        printImage as (
          client: unknown,
          image: Uint8Array,
          model: string,
        ) => Promise<void>
      )(active, png, options.model);
    },

    async reconnect(): Promise<void> {
      try {
        await client?.disconnect();
      } catch (err) {
        options.log(`Disconnect failed: ${String(err)}`);
      }
      client = null;
    },
  };
}
