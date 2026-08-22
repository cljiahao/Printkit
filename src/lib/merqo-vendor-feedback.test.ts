import { describe, it, expect, vi } from "vitest";
import { submitVendorFeedback } from "./merqo-vendor-feedback";

vi.mock("@/lib/merqo-rpc", () => ({ callMerqoRpc: vi.fn() }));
import { callMerqoRpc } from "@/lib/merqo-rpc";

describe("submitVendorFeedback", () => {
  it("calls submit_vendor_feedback with kit slug, nps, and message", async () => {
    vi.mocked(callMerqoRpc).mockResolvedValue({ id: "fb-1" });

    await submitVendorFeedback({} as never, "printkit", 9, "Great tool");

    expect(callMerqoRpc).toHaveBeenCalledWith({}, "submit_vendor_feedback", {
      p_kit_slug: "printkit",
      p_nps: 9,
      p_message: "Great tool",
    });
  });
});
