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
    id: "feie-fp-n20h",
    brand: "Feie",
    model: "FP-N20H",
    connector: "vendor_cloud",
    driver: "feie",
    connectivity: ["4g", "usb"],
    helperDevice: "none",
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
      "Bluetooth only, so it needs an Android phone or a Raspberry Pi next to it.",
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
 * Merqo's order of recommendation, lowest friction first:
 *
 * 1. `cloud_poll`: a standalone printer that joins WiFi and prints. Nothing
 *    beside it, no service to pay for.
 * 2. `vendor_cloud`: prints through the maker's cloud, usually over 4G. No
 *    WiFi needed, but a data plan (and any maker fee) is a running cost.
 * 3. `bridge`: the cheapest printers, but the hardest to onboard, since a
 *    phone or Raspberry Pi has to stay beside them all day.
 */
export const CONNECTOR_RANK: Record<ConnectorId, number> = {
  cloud_poll: 1,
  vendor_cloud: 2,
  bridge: 3,
};

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
  return CONNECTOR_RANK[entry.connector] === 1;
}

/** The default sort: connector tier, then setup effort, then price. */
export function compareRecommended(a: CatalogEntry, b: CatalogEntry): number {
  return (
    CONNECTOR_RANK[a.connector] - CONNECTOR_RANK[b.connector] ||
    a.setupEffort - b.setupEffort ||
    PRICE_RANK[a.priceBand] - PRICE_RANK[b.priceBand]
  );
}

/**
 * The one rule behind the "Works with iPad alone" badge and its filter, so
 * the two can never disagree with the entry itself.
 */
export function worksWithIpadAlone(entry: CatalogEntry): boolean {
  return entry.helperDevice === "none";
}
