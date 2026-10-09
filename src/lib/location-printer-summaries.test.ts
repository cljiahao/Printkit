import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  locations: vi.fn(),
  service: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
}));
vi.mock("@/lib/print-locations", () => ({
  listActiveLocations: mocks.locations,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: mocks.service,
}));
import { listLocationPrinterSummaries } from "./location-printer-summaries";
const locations = [
  { id: "a", label: "A", source_ref: "booth-a" },
  { id: "b", label: "B", source_ref: "booth-b" },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.locations.mockResolvedValue(locations);
  mocks.service.mockResolvedValue({ from: () => ({ select: mocks.select }) });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ in: mocks.in });
  mocks.in.mockResolvedValue({ data: [], error: null });
});
it("batches active locations with vendor and location filters, preserving missing printers and order", async () => {
  mocks.in.mockResolvedValue({
    data: [
      {
        location_id: "b",
        display_name: "Printer B",
        connector: "bridge",
        catalog_id: "b",
        last_seen_at: new Date().toISOString(),
      },
    ],
    error: null,
  });
  const rows = await listLocationPrinterSummaries("vendor-a");
  expect(mocks.locations).toHaveBeenCalledWith("vendor-a");
  expect(mocks.eq).toHaveBeenCalledWith("vendor_id", "vendor-a");
  expect(mocks.in).toHaveBeenCalledExactlyOnceWith("location_id", ["a", "b"]);
  expect(mocks.select).toHaveBeenCalledWith(
    "location_id, display_name, connector, catalog_id, last_seen_at",
  );
  expect(rows.map((row) => [row.location.id, row.state])).toEqual([
    ["a", "not_set_up"],
    ["b", "online"],
  ]);
});
it("uses the new vendor scope on each request without caching another vendor's printers", async () => {
  await listLocationPrinterSummaries("vendor-a");
  mocks.locations.mockResolvedValue([{ id: "c", label: "C", source_ref: "c" }]);
  const rows = await listLocationPrinterSummaries("vendor-b");
  expect(mocks.eq).toHaveBeenLastCalledWith("vendor_id", "vendor-b");
  expect(mocks.in).toHaveBeenLastCalledWith("location_id", ["c"]);
  expect(rows).toMatchObject([{ location: { id: "c" }, printer: null }]);
});
it("does not query printers for no active locations", async () => {
  mocks.locations.mockResolvedValue([]);
  expect(await listLocationPrinterSummaries("vendor-a")).toEqual([]);
  expect(mocks.service).not.toHaveBeenCalled();
});
it("does not render partial printer data on query failure", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.in.mockResolvedValue({
    data: [{ location_id: "a" }],
    error: { message: "unavailable" },
  });
  expect(
    (await listLocationPrinterSummaries("vendor-a")).every(
      (row) => row.printer === null,
    ),
  ).toBe(true);
});
it("treats null result data as missing printers", async () => {
  mocks.in.mockResolvedValue({ data: null, error: null });
  expect(
    (await listLocationPrinterSummaries("vendor-a")).map((row) => row.state),
  ).toEqual(["not_set_up", "not_set_up"]);
});
