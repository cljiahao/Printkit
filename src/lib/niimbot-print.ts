import { NiimbotBluetoothClient, ImageEncoder } from "@mmote/niimbluelib";

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
 * Full print sequence for a NIIMBOT B1, per niimbluelib's own documented
 * usage (AbstractPrintTask's JSDoc example) — printDirection is "top" for
 * the B1 specifically (see Global Constraints), not the library's own
 * example's default "left". printEnd() always runs, even on failure, so a
 * jammed/failed print doesn't leave the printer in an unfinished state for
 * the next job.
 */
export async function printLabel(
  client: NiimbotBluetoothClient,
  canvas: HTMLCanvasElement,
  quantity = 1,
): Promise<void> {
  const encoded = ImageEncoder.encodeCanvas(canvas, "top");
  const printTask = client.abstraction.newPrintTask("B1", {
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
