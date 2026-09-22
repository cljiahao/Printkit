import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const selectMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      auth: { getUser: getUserMock },
      from: () => ({ select: selectMock }),
    }),
}));

const getPrinterByLocationMock = vi.fn();
vi.mock("@/lib/printers", () => ({
  getPrinterByLocation: (...args: unknown[]) =>
    getPrinterByLocationMock(...args),
}));

const rasterizeLayoutMock = vi.fn();
vi.mock("@/lib/label-raster", () => ({
  rasterizeLayout: (...args: unknown[]) => rasterizeLayoutMock(...args),
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ id: "job-1" }) };
const request = new Request(
  "https://printkit.test/api/bridge/jobs/job-1/label",
);

const printer = {
  id: "printer-1",
  catalog_id: "niimbot-b1",
  label_width_mm: 50,
  label_height_mm: 30,
};

function jobReturns(job: unknown, error: unknown = null) {
  selectMock.mockReturnValue({
    eq: () => ({ maybeSingle: () => Promise.resolve({ data: job, error }) }),
  });
}

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: "v1" } } });
  selectMock.mockReset();
  getPrinterByLocationMock.mockReset().mockResolvedValue(printer);
  rasterizeLayoutMock.mockReset().mockResolvedValue(Buffer.from([1, 2, 3]));
  jobReturns({ id: "job-1", payload: {}, location_id: "loc-1" });
});

describe("GET /api/bridge/jobs/[id]/label", () => {
  it("rejects a signed-out caller", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect((await GET(request, context)).status).toBe(401);
  });

  it("returns the rendered PNG", async () => {
    const res = await GET(request, context);

    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("renders at the printer's own label size", async () => {
    await GET(request, context);

    const [layout] = rasterizeLayoutMock.mock.calls[0];
    expect(layout).toMatchObject({ widthMm: 50, heightMm: 30 });
  });

  it("hides another vendor's job behind a 404", async () => {
    jobReturns(null);
    expect((await GET(request, context)).status).toBe(404);
  });

  it("404s a job that has no booth yet", async () => {
    jobReturns({ id: "job-1", payload: {}, location_id: null });
    expect((await GET(request, context)).status).toBe(404);
  });

  it("404s when the booth has no printer", async () => {
    getPrinterByLocationMock.mockResolvedValue(null);
    expect((await GET(request, context)).status).toBe(404);
  });

  it("404s on a read error rather than leaking it", async () => {
    jobReturns(null, { message: "boom" });
    expect((await GET(request, context)).status).toBe(404);
  });
});
