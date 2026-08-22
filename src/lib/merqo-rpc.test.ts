import { describe, it, expect, vi } from "vitest";
import { callMerqoRpc } from "./merqo-rpc";

describe("callMerqoRpc", () => {
  it("calls .schema('merqo').rpc(fnName, args) and returns the data", async () => {
    const rpcMock = vi
      .fn()
      .mockResolvedValue({ data: { id: "row-1" }, error: null });
    const schemaMock = vi.fn().mockReturnValue({ rpc: rpcMock });
    const supabase = { schema: schemaMock } as never;

    const result = await callMerqoRpc(supabase, "some_fn", { p_a: 1 });

    expect(schemaMock).toHaveBeenCalledWith("merqo");
    expect(rpcMock).toHaveBeenCalledWith("some_fn", { p_a: 1 });
    expect(result).toEqual({ id: "row-1" });
  });

  it("throws with the function name and Postgres error message on failure", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    const supabase = { schema: () => ({ rpc: rpcMock }) } as never;

    await expect(callMerqoRpc(supabase, "some_fn", {})).rejects.toThrow(
      "some_fn failed: permission denied",
    );
  });
});
