import type { LabelPrinter } from "./loop.js";

/**
 * The slice of @mmote/niimblue-node (v1.3) this agent uses, typed here
 * because the package is loaded at run time rather than compiled against.
 * Names and shapes follow its published dist/utils.d.ts and
 * dist/image_encoder.d.ts.
 */
type NiimbotClient = {
  connect(): Promise<unknown>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getPrintTaskType(): string | undefined;
  getModelMetadata(): { printDirection?: unknown } | undefined;
};

type SharpImage = {
  flatten(options: { background: string }): SharpImage;
  threshold(level: number): SharpImage;
};

type NiimblueNode = {
  initClient(transport: "ble", address: string, debug: boolean): NiimbotClient;
  loadImageFromBase64(b64: string): Promise<SharpImage>;
  ImageEncoder: {
    encodeImage(
      src: SharpImage,
      pageColor: number,
      printDirection?: unknown,
    ): Promise<unknown>;
  };
  printImages(
    client: NiimbotClient,
    printTaskName: string,
    pages: Array<{ encoded: unknown; quantity?: number }>,
    options: { quantity?: number; labelType?: number; density?: number },
  ): Promise<void>;
};

/** niimbluelib's PageColorType.SingleColor and LabelType.WithGaps. */
const SINGLE_COLOR = 0;
const LABEL_WITH_GAPS = 1;
/** niimbluelib's own default, and what its CLI uses. */
const DENSITY = 3;
/** The server already thresholds to 1 bit; this only guards stray greys. */
const THRESHOLD = 128;

/**
 * Named indirectly so the specifier is resolved at run time rather than
 * build time: the Bluetooth stack is a compiled native module that only
 * exists on the Pi, and printkit's own repo neither installs nor
 * typechecks against it.
 */
const NIIMBLUE_MODULE = "@mmote/niimblue-node";

/**
 * The package is CommonJS, so an ESM import may put its exports on
 * `default`, on the namespace, or both. Both are merged before checking.
 */
function asLibrary(mod: unknown): Partial<NiimblueNode> | null {
  if (typeof mod !== "object" || mod === null) return null;
  const inner = (mod as { default?: unknown }).default;
  return {
    ...(typeof inner === "object" && inner !== null ? inner : {}),
    ...mod,
  } as Partial<NiimblueNode>;
}

/**
 * Loaded at call time, not at import, so the CLI's other commands (pair,
 * use, help) still run on a machine without the native module.
 */
export async function loadNiimblue(
  load: () => Promise<unknown> = () => import(NIIMBLUE_MODULE),
): Promise<NiimblueNode> {
  const lib = asLibrary(await load().catch(() => null));
  if (
    !lib ||
    typeof lib.initClient !== "function" ||
    typeof lib.printImages !== "function" ||
    typeof lib.loadImageFromBase64 !== "function" ||
    !lib.ImageEncoder
  ) {
    throw new Error(
      "The Bluetooth printer library is not installed. Run the installer on the Raspberry Pi.",
    );
  }
  return lib as NiimblueNode;
}

export type BluetoothPrinterOptions = {
  /** The printer's Bluetooth MAC address or its advertised name. */
  address: string;
  /** A niimbluelib print task name such as "B1"; empty lets the printer say. */
  model: string;
  log: (message: string) => void;
  /** Swapped in tests; the real library everywhere else. */
  load?: () => Promise<NiimblueNode>;
};

/**
 * A NIIMBOT printer reachable over Bluetooth from a Raspberry Pi. Printing
 * is one image at a time, and a failure is surfaced rather than retried,
 * matching what the Android bridge does.
 *
 * Upstream tests Windows and macOS; on Linux the Bluetooth layer is
 * @stoprocent/noble over HCI, which needs CAP_NET_RAW (granted by the
 * systemd unit) and BlueZ's packages (installed by install.sh). Unverified
 * on a Pi until the hardware gate.
 */
export function createBluetoothPrinter(
  options: BluetoothPrinterOptions,
): LabelPrinter {
  const load = options.load ?? (() => loadNiimblue());
  let client: NiimbotClient | null = null;

  const connected = async (lib: NiimblueNode): Promise<NiimbotClient> => {
    if (client?.isConnected()) return client;

    const next = lib.initClient("ble", options.address, false);
    await next.connect();
    client = next;
    options.log(`Connected to ${options.address}`);
    return next;
  };

  return {
    async print(png: Uint8Array): Promise<void> {
      const lib = await load();
      const active = await connected(lib);

      const task = options.model || active.getPrintTaskType();
      if (!task) {
        throw new Error(
          "Could not tell which NIIMBOT model this is. Run: printkit-bridge use <printer> B1",
        );
      }

      const image = (
        await lib.loadImageFromBase64(Buffer.from(png).toString("base64"))
      )
        .flatten({ background: "#fff" })
        .threshold(THRESHOLD);
      const encoded = await lib.ImageEncoder.encodeImage(
        image,
        SINGLE_COLOR,
        active.getModelMetadata()?.printDirection,
      );

      await lib.printImages(active, task, [{ encoded }], {
        quantity: 1,
        labelType: LABEL_WITH_GAPS,
        density: DENSITY,
      });
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
