import { describe, it, expect, vi } from "vitest";
import { submitSupportMessage } from "./merqo-support";

vi.mock("@/lib/merqo-rpc", () => ({ callMerqoRpc: vi.fn() }));
import { callMerqoRpc } from "@/lib/merqo-rpc";

describe("submitSupportMessage", () => {
  it("calls submit_support_message with the printkit slug, category, and body", async () => {
    vi.mocked(callMerqoRpc).mockResolvedValue({ id: "sm-1" });

    await submitSupportMessage({} as never, "printer", "Bluetooth won't pair");

    expect(callMerqoRpc).toHaveBeenCalledWith({}, "submit_support_message", {
      p_kit_slug: "printkit",
      p_category: "printer",
      p_body: "Bluetooth won't pair",
    });
  });
});
