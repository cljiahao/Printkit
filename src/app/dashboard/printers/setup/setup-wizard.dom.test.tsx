// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getCatalogEntry } from "@/lib/printer-catalog";
import { BridgeSetup, CloudPollSetup, VendorCloudSetup } from "./setup-wizard";
const m = vi.hoisted(() => ({
  url: vi.fn(),
  register: vi.fn(),
  pair: vi.fn(),
  state: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("./actions", () => ({
  createPrinterUrl: m.url,
  registerBrandCloudPrinter: m.register,
  createBridgePairingCode: m.pair,
  readPrinterState: m.state,
}));
vi.mock("sonner", () => ({ toast: { error: m.error, success: m.success } }));
function entry(id: string) {
  const result = getCatalogEntry(id);
  if (!result) throw new Error(`Missing catalog fixture ${id}`);
  return result;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.state.mockResolvedValue("offline");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("retries address creation and reports clipboard outcomes", async () => {
  const user = userEvent.setup();
  m.state.mockResolvedValue("online");
  m.url
    .mockResolvedValueOnce({ ok: false, error: "Try again" })
    .mockResolvedValueOnce({
      ok: true,
      url: "https://test.invalid/printer/token",
    });
  render(
    <CloudPollSetup entry={entry("star-mc-label2")} locationId="location" />,
  );
  expect(
    await screen.findByText(/Connected\. Your next order/),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create the address" }));
  expect(m.error).toHaveBeenCalledWith("Try again");
  await user.click(screen.getByRole("button", { name: "Create the address" }));
  expect(m.url).toHaveBeenLastCalledWith("location", "star-mc-label2");
  const write = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockRejectedValueOnce(new Error("denied"))
    .mockResolvedValueOnce(undefined);
  await user.click(await screen.findByRole("button", { name: "Copy address" }));
  await waitFor(() =>
    expect(m.error).toHaveBeenCalledWith("Could not copy the address"),
  );
  await user.click(screen.getByRole("button", { name: "Copy address" }));
  await waitFor(() => expect(m.success).toHaveBeenCalledWith("Address copied"));
  expect(write).toHaveBeenCalledWith("https://test.invalid/printer/token");
});
it.each([
  ["feie-fp-n20w", "online"],
  ["feie-fp-n20h", "offline"],
] as const)(
  "registers %s, clears the temporary key, and reports %s",
  async (id, state) => {
    const user = userEvent.setup();
    m.register.mockResolvedValue({ ok: true, state });
    m.state.mockResolvedValue(state);
    render(<VendorCloudSetup entry={entry(id)} locationId="location" />);
    expect(
      screen.getByRole("button", { name: "Add this printer" }),
    ).toBeDisabled();
    await user.type(screen.getByLabelText("SN"), " SN ");
    await user.type(screen.getByLabelText("KEY"), " KEY ");
    await user.click(screen.getByRole("button", { name: "Add this printer" }));
    expect(m.register).toHaveBeenCalledWith("location", id, "SN", "KEY");
    await waitFor(() => expect(screen.getByLabelText("KEY")).toHaveValue(""));
    expect(m.success).toHaveBeenCalledWith(
      state === "online"
        ? "Printer added and online"
        : "Printer added. It will show as online once it is switched on.",
    );
  },
);
it("retains inputs on a rejected registration", async () => {
  const user = userEvent.setup();
  m.register.mockResolvedValue({ ok: false, error: "Wrong key" });
  render(
    <VendorCloudSetup entry={entry("feie-fp-n20w")} locationId="location" />,
  );
  await user.type(screen.getByLabelText("SN"), "SN");
  await user.type(screen.getByLabelText("KEY"), "KEY");
  await user.click(screen.getByRole("button", { name: "Add this printer" }));
  expect(m.error).toHaveBeenCalledWith("Wrong key");
  expect(screen.getByLabelText("KEY")).toHaveValue("KEY");
  expect(screen.getByText("Add the printer above first.")).toBeInTheDocument();
});
it("offers an encoded Android bridge link and retries Pi pairing", async () => {
  const user = userEvent.setup();
  m.pair
    .mockResolvedValueOnce({ ok: false, error: "Try pairing again" })
    .mockResolvedValueOnce({ ok: true, code: "ABCD-EFGH" });
  render(<BridgeSetup locationId="location" boothRef="booth & one" />);
  await user.click(
    screen.getByRole("button", { name: "Android phone or laptop" }),
  );
  expect(
    screen.getByRole("link", { name: "Open bridge mode" }),
  ).toHaveAttribute("href", "/dashboard/bridge?booth=booth%20%26%20one");
  await user.click(screen.getByRole("button", { name: "Raspberry Pi" }));
  await user.click(screen.getByRole("button", { name: "Show a pairing code" }));
  expect(m.error).toHaveBeenCalledWith("Try pairing again");
  await user.click(screen.getByRole("button", { name: "Show a pairing code" }));
  expect(await screen.findByText("ABCD-EFGH")).toBeInTheDocument();
  expect(m.pair).toHaveBeenCalledWith("location");
});
it.each(["address", "registration", "pairing"] as const)(
  "recovers from a rejected %s request",
  async (kind) => {
    const user = userEvent.setup();
    if (kind === "address") {
      m.url.mockRejectedValueOnce(new Error("offline"));
      render(
        <CloudPollSetup
          entry={entry("star-mc-label2")}
          locationId="location"
        />,
      );
    } else if (kind === "registration") {
      m.register.mockRejectedValueOnce(new Error("offline"));
      render(
        <VendorCloudSetup
          entry={entry("feie-fp-n20w")}
          locationId="location"
        />,
      );
      await user.type(screen.getByLabelText("SN"), "SN");
      await user.type(screen.getByLabelText("KEY"), "KEY");
    } else {
      m.pair.mockRejectedValueOnce(new Error("offline"));
      render(<BridgeSetup locationId="location" boothRef="booth" />);
      await user.click(screen.getByRole("button", { name: "Raspberry Pi" }));
    }
    let label = "Show a pairing code";
    if (kind === "address") label = "Create the address";
    else if (kind === "registration") label = "Add this printer";
    await user.click(screen.getByRole("button", { name: label }));
    await waitFor(() =>
      expect(m.error).toHaveBeenCalledWith(
        "Could not complete setup. Please try again.",
      ),
    );
    expect(screen.getByRole("button", { name: label })).toBeEnabled();
  },
);
