import { NiimbotBluetoothClient, ImageEncoder } from "@mmote/niimbluelib";
import { NIIMBOT_MODELS, DEFAULT_NIIMBOT_MODEL } from "@/lib/niimbot-model";

/**
 * Opens the browser's native Bluetooth device chooser (navigator.bluetooth.
 * requestDevice, invoked internally by NiimbotBluetoothClient.connect()) —
 * must be called from a real user gesture (a button click), never
 * programmatically on mount. See Plan 4's Global Constraints.
 */
export async function connectPrinter(): Promise<NiimbotBluetoothClient> {
  const client = new NiimbotBluetoothClient();
  await client.connect();
  return client;
}

/**
 * Full print sequence, per niimbluelib's own documented usage
 * (AbstractPrintTask's JSDoc example). printEnd() always runs, even on
 * failure, so a jammed/failed print doesn't leave the printer in an
 * unfinished state for the next job. Model defaults to the only one
 * currently supported (see niimbot-model.ts) — adding a second model is a
 * config entry there, not a change here.
 */
export async function printLabel(
  client: NiimbotBluetoothClient,
  canvas: HTMLCanvasElement,
  quantity = 1,
  model = DEFAULT_NIIMBOT_MODEL,
): Promise<void> {
  const { printDirection } = NIIMBOT_MODELS[model];
  const encoded = ImageEncoder.encodeCanvas(canvas, printDirection);
  const printTask = client.abstraction.newPrintTask(model, {
    totalPages: quantity,
  });

  try {
    await printTask.printInit();
    await printTask.printPage(encoded, quantity);
    await printTask.waitForPageFinished();
    await printTask.waitForFinished();
  } finally {
    await printTask.printEnd();
  }
}

export async function disconnectPrinter(
  client: NiimbotBluetoothClient,
): Promise<void> {
  await client.disconnect();
}
