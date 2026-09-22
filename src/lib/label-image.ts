/**
 * Turns a server-rendered label PNG into the canvas niimbluelib encodes.
 * Browser-only: it is the one place the bridge touches image decoding, now
 * that no device draws its own label.
 */
export async function pngToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return canvas;
}

export async function fetchLabelCanvas(
  jobId: string,
): Promise<HTMLCanvasElement> {
  return download(`/api/bridge/jobs/${jobId}/label`);
}

/**
 * The test print: a sample label at this booth's own label size, so what a
 * vendor checks during setup matches what an order will print.
 */
export async function fetchSampleLabelCanvas(
  locationId: string,
): Promise<HTMLCanvasElement> {
  return download(
    `/api/bridge/sample-label?location=${encodeURIComponent(locationId)}`,
  );
}

async function download(url: string): Promise<HTMLCanvasElement> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Label download failed (${response.status})`);
  }
  return pngToCanvas(await response.blob());
}
