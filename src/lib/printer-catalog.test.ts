import { describe, it, expect } from "vitest";
import {
  PRINTER_CATALOG,
  compareRecommended,
  getCatalogEntry,
  isRecommended,
  listCatalog,
  worksWithIpadAlone,
} from "./printer-catalog";

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

  it("recommends only standalone WiFi printers", () => {
    const recommended = listCatalog().filter(isRecommended);
    expect(recommended.map((entry) => entry.connector)).toEqual(
      recommended.map(() => "cloud_poll"),
    );
    expect(recommended.length).toBeGreaterThan(0);
  });

  it("ranks WiFi, then maker cloud, then Bluetooth", () => {
    const order = [...listCatalog()]
      .sort(compareRecommended)
      .map((entry) => entry.connector);
    expect(order).toEqual(["cloud_poll", "vendor_cloud", "bridge"]);
  });

  it("breaks a tie on setup effort, then price", () => {
    const base = getCatalogEntry("star-mc-label2");
    if (!base) throw new Error("catalog entry missing");
    const easier = { ...base, setupEffort: 1 as const };
    const cheaper = { ...base, priceBand: "low" as const };

    expect(compareRecommended(easier, base)).toBeLessThan(0);
    expect(compareRecommended(cheaper, base)).toBeLessThan(0);
  });

  it("ships no entry claiming hardware verification yet", () => {
    expect(PRINTER_CATALOG.every((entry) => !entry.hardwareVerified)).toBe(
      true,
    );
  });
});
