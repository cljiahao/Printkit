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
 * A NIIMBOT B1 prints the label and then, on some firmware, never sends the
 * "page done" / "job done" packets the library waits for
 * ("Timeout waiting response (waited for de, df, dd, d9)"). Observed on a
 * real B1 over Web Bluetooth: paper came out, the wait timed out anyway.
 * Treating that as a failure is worse than accepting it: the vendor sees a
 * failed job, reprints, and burns a second label for an order already
 * labelled. The bytes are only sent once, by printPage, which is what must
 * succeed.
 */
function isAcknowledgementTimeout(err: unknown): boolean {
  return err instanceof Error && /timeout waiting response/i.test(err.message);
}

/**
 * Waits for the printer to say it finished, tolerating a printer that never
 * does. Any other failure is a real one and is rethrown.
 */
async function waitForPrintToSettle(printTask: {
  waitForPageFinished: () => Promise<void>;
  waitForFinished: () => Promise<void>;
}): Promise<void> {
  try {
    await printTask.waitForPageFinished();
    await printTask.waitForFinished();
  } catch (err) {
    if (!isAcknowledgementTimeout(err)) throw err;
    console.warn("niimbot: printed, but the printer never acknowledged it");
  }
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
    await waitForPrintToSettle(printTask);
  } finally {
    // Closing the job is housekeeping: a printer that ignored the wait
    // above usually ignores this too, and the label is already out.
    await printTask.printEnd().catch((err: unknown) => {
      console.warn("niimbot: printEnd failed", err);
    });
  }
}

export async function disconnectPrinter(
  client: NiimbotBluetoothClient,
): Promise<void> {
  await client.disconnect();
}
