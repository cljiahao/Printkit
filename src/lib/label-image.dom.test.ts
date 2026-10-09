// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  fetchLabelCanvas,
  fetchSampleLabelCanvas,
  pngToCanvas,
} from "./label-image";
const close = vi.fn();
const drawImage = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 320, height: 240, close }),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("draws at decoded dimensions and releases the bitmap", async () => {
  const canvas = await pngToCanvas(new Blob());
  expect([canvas.width, canvas.height]).toEqual([320, 240]);
  expect(drawImage).toHaveBeenCalledWith(
    expect.objectContaining({ width: 320 }),
    0,
    0,
  );
  expect(close).toHaveBeenCalledOnce();
});
it("releases decoded memory when the canvas context is unavailable", async () => {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
  await expect(pngToCanvas(new Blob())).rejects.toThrow(
    "Canvas 2D context unavailable",
  );
  expect(close).toHaveBeenCalledOnce();
});
it("releases decoded memory if drawing fails", async () => {
  drawImage.mockImplementationOnce(() => {
    throw new Error("draw failed");
  });
  await expect(pngToCanvas(new Blob())).rejects.toThrow("draw failed");
  expect(close).toHaveBeenCalledOnce();
});
it("downloads order labels without caching", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, blob: async () => new Blob() });
  vi.stubGlobal("fetch", fetchMock);
  await fetchLabelCanvas("job-id");
  expect(fetchMock).toHaveBeenCalledWith("/api/bridge/jobs/job-id/label", {
    cache: "no-store",
  });
});
it("encodes sample locations and reports failed downloads", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
  vi.stubGlobal("fetch", fetchMock);
  await expect(fetchSampleLabelCanvas("a&b")).rejects.toThrow(
    "Label download failed (404)",
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/bridge/sample-label?location=a%26b",
    { cache: "no-store" },
  );
  expect(createImageBitmap).not.toHaveBeenCalled();
});
