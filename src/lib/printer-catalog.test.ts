import { describe, it, expect } from "vitest";
import {
  PRINTER_CATALOG,
  compareRecommended,
  getCatalogEntry,
  isRecommended,
  listCatalog,
  recommendationTier,
  worksWithIpadAlone,
} from "./printer-catalog";

function entryOf(id: string) {
  const entry = getCatalogEntry(id);
  if (!entry) throw new Error(`catalog entry ${id} missing`);
  return entry;
}

describe("printer catalog", () => {
  it("exposes unique ids", () => {
    const ids = PRINTER_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds an entry by id and returns null for an unknown id", () => {
    expect(getCatalogEntry("feie-fp-n20h")?.connector).toBe("vendor_cloud");
    expect(getCatalogEntry("nope")).toBeNull();
  });

  it("treats a printer with no helper device as iPad-only capable", () => {
    const feie = getCatalogEntry("feie-fp-n20h");
    const niimbot = getCatalogEntry("niimbot-b1");
    expect(feie && worksWithIpadAlone(feie)).toBe(true);
    expect(niimbot && worksWithIpadAlone(niimbot)).toBe(false);
  });

  it("hides dev-only entries unless asked for them", () => {
    expect(listCatalog().some((entry) => entry.id === "virtual")).toBe(false);
    expect(
      listCatalog({ includeDev: true }).some((entry) => entry.id === "virtual"),
    ).toBe(true);
  });

  it("keeps every entry's default label width inside its own range", () => {
    for (const entry of PRINTER_CATALOG) {
      expect(entry.defaultLabelMm.width).toBeGreaterThanOrEqual(
        entry.labelWidthMm.min,
      );
      expect(entry.defaultLabelMm.width).toBeLessThanOrEqual(
        entry.labelWidthMm.max,
      );
    }
  });

  it("marks every bluetooth entry as needing a helper device", () => {
    for (const entry of PRINTER_CATALOG) {
      if (entry.connector !== "bridge") continue;
      expect(entry.helperDevice).toBe("android_or_pi");
      expect(isRecommended(entry)).toBe(false);
    }
  });

  it("recommends only printers that need nothing else and cost nothing more", () => {
    const recommended = listCatalog().filter(isRecommended);
    expect(recommended.length).toBeGreaterThan(0);
    for (const entry of recommended) {
      expect(entry.helperDevice).toBe("none");
      expect(entry.monthlyCost).toBe("none");
    }
  });

  it("puts a WiFi printer from either connector in the top tier", () => {
    expect(recommendationTier(entryOf("feie-fp-n20w"))).toBe(1);
    expect(recommendationTier(entryOf("star-mc-label2"))).toBe(1);
    expect(recommendationTier(entryOf("feie-fp-n20h"))).toBe(2);
    expect(recommendationTier(entryOf("niimbot-b1"))).toBe(3);
  });

  it("ranks cheapest first within a tier, then the running-cost and helper tiers", () => {
    const order = [...listCatalog()].sort(compareRecommended).map((e) => e.id);
    expect(order).toEqual([
      "feie-fp-n20w",
      "star-mc-label2",
      "feie-fp-n20h",
      "niimbot-b1",
    ]);
  });

  it("breaks a price tie on setup effort", () => {
    const base = entryOf("star-mc-label2");
    const easier = { ...base, setupEffort: 1 as const };
    const cheaper = {
      ...base,
      priceBand: "low" as const,
      setupEffort: 3 as const,
    };

    expect(compareRecommended(easier, base)).toBeLessThan(0);
    expect(compareRecommended(cheaper, easier)).toBeLessThan(0);
  });

  it("gives every 4G printer a running cost", () => {
    for (const entry of PRINTER_CATALOG) {
      if (entry.connectivity.includes("4g")) {
        expect(entry.monthlyCost).toBe("data_plan");
      }
    }
  });

  it("ships no entry claiming hardware verification yet", () => {
    expect(PRINTER_CATALOG.every((entry) => !entry.hardwareVerified)).toBe(
      true,
    );
  });
});
