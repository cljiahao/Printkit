/**
 * The plain-language explanations behind every badge, icon and filter on the
 * printer picker. They live in one place because the same sentence has to
 * appear on the picker, in a setup wizard and in the Bluetooth guide: a
 * vendor deciding what to buy should not meet three different wordings of
 * the same fact.
 */
export type InfoTopic =
  | "ipad_alone"
  | "helper_device"
  | "4g"
  | "wifi"
  | "bluetooth"
  | "untested"
  | "setup_effort"
  | "price_band"
  | "label_width"
  | "recommended";

export const INFO_COPY: Record<InfoTopic, { title: string; body: string }> = {
  ipad_alone: {
    title: "Works with iPad alone",
    body: "This printer connects to the internet itself. You do not need an extra phone or computer next to it.",
  },
  helper_device: {
    title: "Needs a helper device",
    body: "Bluetooth printers cannot reach the internet. An Android phone or a Raspberry Pi has to stay switched on next to the printer to pass jobs to it.",
  },
  "4g": {
    title: "4G",
    body: "Has its own SIM card slot, so it prints without WiFi. Good for stalls with no WiFi at all. Jobs go through the maker's cloud service, so the data plan is a monthly cost.",
  },
  wifi: {
    title: "WiFi",
    body: "Joins a WiFi network or your phone's hotspot. You set the network once, where the printer will be used.",
  },
  bluetooth: {
    title: "Bluetooth",
    body: "Talks only to a device within about 10 metres. It cannot receive orders on its own.",
  },
  untested: {
    title: "Untested with real hardware",
    body: "Built to the maker's published instructions, but Merqo has not yet tested this exact model on a real unit.",
  },
  setup_effort: {
    title: "Setup effort",
    body: "1 means plug it in and go. 3 means extra devices and more steps before your first label.",
  },
  price_band: {
    title: "Price",
    body: "A rough band, not a quote. Prices move, so check with a seller before you buy.",
  },
  label_width: {
    title: "Label width",
    body: "The widest sticker roll the printer takes. Cup labels are usually 40 mm to 50 mm.",
  },
  recommended: {
    title: "Recommended",
    body: "Joins your WiFi or phone hotspot and prints by itself. Nothing extra to keep charged next to it, and no printing service to pay for every month.",
  },
};

export const BLUETOOTH_WARNING =
  "We do not recommend this setup. A Bluetooth printer needs a second device that stays switched on next to it all day. If you are choosing a new printer, pick one that works with an iPad alone.";
