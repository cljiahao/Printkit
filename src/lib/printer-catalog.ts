export type ConnectorId = "cloud_poll" | "vendor_cloud" | "bridge";

/**
 * Static facts about one supported printer model. Version-controlled rather
 * than a table: the connector and driver a model needs are code, not vendor
 * data, and a model is only selectable once its driver exists.
 */
export type CatalogEntry = {
  id: string;
  brand: string;
  model: string;
  connector: ConnectorId;
  driver: string;
  connectivity: Array<"4g" | "wifi" | "ethernet" | "bluetooth" | "usb">;
  helperDevice: "none" | "android_or_pi";
  /**
   * A cost the vendor keeps paying after buying the printer: a 4G data plan.
   * Maker clouds themselves (Feie, Xpyun) charge nothing to use.
   */
  monthlyCost: "none" | "data_plan";
  labelWidthMm: { min: number; max: number };
  defaultLabelMm: { width: number; height: number };
  dpi: number;
  power: "mains" | "battery" | "mains_or_battery";
  setupEffort: 1 | 2 | 3;
  priceBand: "low" | "mid" | "high";
  hardwareVerified: boolean;
  devOnly: boolean;
  image: string;
  notes: string[];
};

export const PRINTER_CATALOG: readonly CatalogEntry[] = [
  {
    id: "feie-fp-n20w",
    brand: "Feie",
    model: "FP-N20W",
    connector: "vendor_cloud",
    driver: "feie",
    connectivity: ["wifi", "usb"],
    helperDevice: "none",
    monthlyCost: "none",
    labelWidthMm: { min: 25, max: 56 },
    defaultLabelMm: { width: 50, height: 30 },
    dpi: 203,
    power: "mains",
    setupEffort: 2,
    priceBand: "low",
    hardwareVerified: false,
    devOnly: false,
    image: "/printers/feie-fp-n20w.jpg",
    notes: [
      "Joins your WiFi or phone hotspot. No SIM and no monthly fee.",
      "Jobs pass through Feie's cloud, so printing depends on that service being up.",
      "Needs mains power.",
    ],
  },
  {
    id: "feie-fp-n20h",
    brand: "Feie",
    model: "FP-N20H",
    connector: "vendor_cloud",
    driver: "feie",
    connectivity: ["4g", "usb"],
    helperDevice: "none",
    monthlyCost: "data_plan",
    labelWidthMm: { min: 25, max: 56 },
    defaultLabelMm: { width: 50, height: 30 },
    dpi: 203,
    power: "mains",
    setupEffort: 1,
    priceBand: "low",

    hardwareVerified: false,
    devOnly: false,
    image: "/printers/feie-fp-n20h.jpg",
    notes: [
      "Has its own SIM card slot, so it prints without WiFi.",
      "Prints through Feie's cloud service, so the 4G data plan is a running cost.",
      "Needs mains power.",
    ],
  },
  {
    id: "star-mc-label2",
    brand: "Star Micronics",
    model: "mC-Label2",
    connector: "cloud_poll",
    driver: "star-cloudprnt",
    connectivity: ["wifi", "ethernet", "bluetooth", "usb"],
    helperDevice: "none",
    monthlyCost: "none",
    labelWidthMm: { min: 25, max: 60 },
    defaultLabelMm: { width: 50, height: 30 },
    dpi: 300,
    power: "mains",
    setupEffort: 2,
    priceBand: "high",

    hardwareVerified: false,
    devOnly: false,
    image: "/printers/star-mc-label2.jpg",
    notes: [
      "Connects over your WiFi or a phone hotspot.",
      "Buy the X4 model (MCL21 X4): it has WiFi built in. The CI model is cable-only unless you add a WiFi dongle.",
      "Needs mains power.",
    ],
  },
  {
    id: "niimbot-b1",
    brand: "NIIMBOT",
    model: "B1",
    connector: "bridge",
    driver: "niimbot",
    connectivity: ["bluetooth"],
    helperDevice: "android_or_pi",
    monthlyCost: "none",
    labelWidthMm: { min: 20, max: 50 },
    defaultLabelMm: { width: 50, height: 30 },
    dpi: 203,
    power: "battery",
    setupEffort: 3,
    priceBand: "low",

    hardwareVerified: false,
    devOnly: false,
    image: "/printers/niimbot-b1.jpg",
    notes: [
      "Bluetooth only, so it needs an Android phone, a laptop or a Raspberry Pi next to it. An iPad cannot drive it.",
      "Runs on its own battery.",
    ],
  },
  {
    id: "virtual",
    brand: "Merqo",
    model: "Virtual printer",
    connector: "cloud_poll",
    driver: "star-cloudprnt",
    connectivity: ["wifi"],
    helperDevice: "none",
    monthlyCost: "none",
    labelWidthMm: { min: 25, max: 60 },
    defaultLabelMm: { width: 50, height: 30 },
    dpi: 203,
    power: "mains",
    setupEffort: 1,
    priceBand: "low",

    hardwareVerified: false,
    devOnly: true,
    image: "/printers/virtual.svg",
    notes: ["A test printer that prints to a browser page, for development."],
  },
];

export function getCatalogEntry(id: string): CatalogEntry | null {
  return PRINTER_CATALOG.find((entry) => entry.id === id) ?? null;
}

export function listCatalog(opts?: { includeDev?: boolean }): CatalogEntry[] {
  return PRINTER_CATALOG.filter(
    (entry) => !entry.devOnly || opts?.includeDev === true,
  );
}

/**
 * Merqo's order of recommendation, by what the vendor lives with rather
 * than how the job travels (decided 2026-09-22):
 *
 * 1. Works with an iPad alone and costs nothing after purchase: a WiFi
 *    printer, whether it polls printkit (Star) or goes through its maker's
 *    free cloud (Feie WiFi).
 * 2. Works with an iPad alone but has a running cost: a 4G printer's data
 *    plan.
 * 3. Needs a phone or Raspberry Pi beside it all day: Bluetooth.
 *
 * Within a tier the cheaper printer comes first, then the easier setup.
 */
export function recommendationTier(entry: CatalogEntry): 1 | 2 | 3 {
  if (entry.helperDevice !== "none") return 3;
  return entry.monthlyCost === "none" ? 1 : 2;
}

const PRICE_RANK: Record<CatalogEntry["priceBand"], number> = {
  low: 1,
  mid: 2,
  high: 3,
};

/**
 * The "Recommended" badge: only the top tier earns it, so the badge and the
 * default sort can never disagree.
 */
export function isRecommended(entry: CatalogEntry): boolean {
  return recommendationTier(entry) === 1;
}

/** The default sort: tier, then price, then setup effort. */
export function compareRecommended(a: CatalogEntry, b: CatalogEntry): number {
  return (
    recommendationTier(a) - recommendationTier(b) ||
    PRICE_RANK[a.priceBand] - PRICE_RANK[b.priceBand] ||
    a.setupEffort - b.setupEffort
  );
}

/**
 * The one rule behind the "Works with iPad alone" badge and its filter, so
 * the two can never disagree with the entry itself.
 */
export function worksWithIpadAlone(entry: CatalogEntry): boolean {
  return entry.helperDevice === "none";
}
