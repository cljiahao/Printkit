import { describe, it, expect, vi } from "vitest";
import {
  getOrCreateVendorProfile,
  upsertVendorProfile,
} from "./merqo-vendor-profile";

vi.mock("@/lib/merqo-rpc", () => ({
  callMerqoRpc: vi.fn(),
}));

import { callMerqoRpc } from "@/lib/merqo-rpc";

describe("getOrCreateVendorProfile", () => {
  it("calls get_or_create_vendor_profile with the vendor id and default name", async () => {
    vi.mocked(callMerqoRpc).mockResolvedValue({
      vendor_id: "v1",
      stall_name: "Ada's Prints",
      social_links: {},
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    });

    const result = await getOrCreateVendorProfile(
      {} as never,
      "v1",
      "Ada's Prints",
    );

    expect(callMerqoRpc).toHaveBeenCalledWith(
      {},
      "get_or_create_vendor_profile",
      {
        p_vendor_id: "v1",
        p_default_stall_name: "Ada's Prints",
      },
    );
    expect(result.stall_name).toBe("Ada's Prints");
  });
});

describe("upsertVendorProfile", () => {
  it("calls upsert_vendor_profile with the stall name and social links", async () => {
    vi.mocked(callMerqoRpc).mockResolvedValue({
      vendor_id: "v1",
      stall_name: "New Name",
      social_links: { instagram: "https://instagram.com/x" },
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    });

    await upsertVendorProfile({} as never, "v1", "New Name", {
      instagram: "https://instagram.com/x",
    });

    expect(callMerqoRpc).toHaveBeenCalledWith({}, "upsert_vendor_profile", {
      p_vendor_id: "v1",
      p_stall_name: "New Name",
      p_social_links: { instagram: "https://instagram.com/x" },
    });
  });
});
