import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { buildLabelLayout } from "@/lib/label-layout";
import { feieDriver } from "./feie";

const job = {
  jobId: "job-1",
  layout: buildLabelLayout(
    { customer_name: "Ada", order_number: "67" },
    { widthMm: 50, heightMm: 30 },
  ),
  dpi: 203,
};

function feieResponds(body: unknown) {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastBody(fetchMock: ReturnType<typeof feieResponds>): URLSearchParams {
  const init = fetchMock.mock.calls[0]?.[1];
  return init?.body as URLSearchParams;
}

beforeEach(() => {
  process.env.FEIE_USER = "merqo@test.dev";
  process.env.FEIE_UKEY = "ukey-123";
  process.env.FEIE_API_BASE = "https://api.jp.feieyun.test/Api/Open/";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FEIE_USER;
  delete process.env.FEIE_UKEY;
  delete process.env.FEIE_API_BASE;
});

describe("feie: request signing", () => {
  it("signs every call with sha1 of user, ukey and stime", async () => {
    const fetchMock = feieResponds({ ret: 0, msg: "ok", data: "order-1" });

    await feieDriver.send("SN1", job);

    const body = lastBody(fetchMock);
    const stime = body.get("stime") as string;
    expect(body.get("sig")).toBe(
      // eslint-disable-next-line sonarjs/hashing
      createHash("sha1")
        .update(`merqo@test.dev${"ukey-123"}${stime}`, "utf8")
        .digest("hex"),
    );
    expect(body.get("apiname")).toBe("Open_printLabelMsg");
  });

  it("fails without calling out when the account is not configured", async () => {
    delete process.env.FEIE_USER;
    const fetchMock = feieResponds({ ret: 0 });

    const result = await feieDriver.send("SN1", job);

    expect(result).toEqual({ ok: false, error: "Feie is not configured." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("feie: registerPrinter", () => {
  it("posts SN, KEY and a name, and keeps only the SN", async () => {
    const fetchMock = feieResponds({ ret: 0, msg: "ok", data: "" });

    const result = await feieDriver.registerPrinter({
      sn: "SN1",
      key: "KEY1",
      name: "Kopitiam Cart",
    });

    expect(lastBody(fetchMock).get("printerContent")).toBe(
      "SN1#KEY1#Kopitiam Cart",
    );
    expect(result).toEqual({ ok: true, deviceRef: "SN1" });
  });

  it("refuses an incomplete form without calling out", async () => {
    const fetchMock = feieResponds({ ret: 0 });
    const result = await feieDriver.registerPrinter({ sn: "SN1", key: "" });

    expect(result).toEqual({
      ok: false,
      error: "Enter the printer's SN and KEY.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when the maker refuses the printer inside a successful reply", async () => {
    feieResponds({
      ret: 0,
      msg: "ok",
      data: { ok: [], no: ["SN1#KEY1#Cart (错误：识别码不正确)"] },
    });

    expect(
      await feieDriver.registerPrinter({ sn: "SN1", key: "KEY1" }),
    ).toEqual({
      ok: false,
      error:
        "The printer rejected that KEY. Check the label under the printer.",
    });
  });

  it("treats a printer already on the account as registered", async () => {
    feieResponds({
      ret: 0,
      msg: "ok",
      data: { ok: [], no: ["SN1#KEY1#Cart (错误：已被添加过)"] },
    });

    expect(
      await feieDriver.registerPrinter({ sn: "SN1", key: "KEY1" }),
    ).toEqual({ ok: true, deviceRef: "SN1" });
  });

  it("passes an unrecognised refusal through", async () => {
    feieResponds({
      ret: 0,
      msg: "ok",
      data: { ok: [], no: ["SN1 (错误：x)"] },
    });

    const result = await feieDriver.registerPrinter({ sn: "SN1", key: "K" });
    expect(result.ok).toBe(false);
  });

  it("surfaces the maker's own reason for a rejection", async () => {
    feieResponds({ ret: 1002, msg: "printer already bound" });

    expect(
      await feieDriver.registerPrinter({ sn: "SN1", key: "KEY1" }),
    ).toEqual({ ok: false, error: "printer already bound" });
  });
});

describe("feie: send", () => {
  it("posts the label markup and returns the maker's job id", async () => {
    const fetchMock = feieResponds({ ret: 0, msg: "ok", data: "order-9" });

    const result = await feieDriver.send("SN1", job);

    const body = lastBody(fetchMock);
    expect(body.get("sn")).toBe("SN1");
    expect(body.get("content")).toContain("<SIZE>50,30</SIZE>");
    expect(body.get("times")).toBe("1");
    expect(result).toEqual({ ok: true, driverRef: "order-9" });
  });

  it("asks Feie to call back when printkit knows its own address", async () => {
    process.env.PRINTKIT_PUBLIC_URL = "https://printkit.test";
    const fetchMock = feieResponds({ ret: 0, msg: "ok", data: "order-9" });

    await feieDriver.send("SN1", job);

    expect(lastBody(fetchMock).get("backurl")).toBe(
      "https://printkit.test/api/feie/callback",
    );
    delete process.env.PRINTKIT_PUBLIC_URL;
  });

  it("still sends without a callback address", async () => {
    delete process.env.PRINTKIT_PUBLIC_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
    const fetchMock = feieResponds({ ret: 0, msg: "ok", data: "order-9" });

    const result = await feieDriver.send("SN1", job);

    expect(lastBody(fetchMock).has("backurl")).toBe(false);
    expect(result.ok).toBe(true);
  });

  it("fails when the maker returns no job id", async () => {
    feieResponds({ ret: 0, msg: "ok", data: "" });
    expect(await feieDriver.send("SN1", job)).toEqual({
      ok: false,
      error: "The printer's service returned no job id.",
    });
  });

  it("fails without throwing when the network is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    expect(await feieDriver.send("SN1", job)).toEqual({
      ok: false,
      error: "Could not reach the printer's service.",
    });
  });

  it("fails without throwing on malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>502</html>")),
    );

    const result = await feieDriver.send("SN1", job);
    expect(result.ok).toBe(false);
  });
});

describe("feie: status queries", () => {
  it("maps a printed job", async () => {
    feieResponds({ ret: 0, msg: "ok", data: true });
    expect(await feieDriver.queryJob("order-9")).toBe("printed");
  });

  it("maps a job still waiting", async () => {
    feieResponds({ ret: 0, msg: "ok", data: false });
    expect(await feieDriver.queryJob("order-9")).toBe("pending");
  });

  it("treats an unreachable service as still pending, not failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    expect(await feieDriver.queryJob("order-9")).toBe("pending");
  });

  it("maps an offline printer", async () => {
    feieResponds({ ret: 0, msg: "ok", data: "off-line" });
    expect(await feieDriver.queryPrinter("SN1")).toBe("offline");
  });

  it("maps an offline printer on the Asia-Pacific station", async () => {
    feieResponds({ ret: 0, msg: "ok", data: "离线。" });
    expect(await feieDriver.queryPrinter("SN1")).toBe("offline");
  });

  it("counts an abnormal but online printer as reachable", async () => {
    feieResponds({ ret: 0, msg: "ok", data: "在线，工作状态不正常。" });
    expect(await feieDriver.queryPrinter("SN1")).toBe("online");
  });

  it("maps a working printer", async () => {
    feieResponds({
      ret: 0,
      msg: "ok",
      data: "The online working condition is normal",
    });
    expect(await feieDriver.queryPrinter("SN1")).toBe("online");
  });

  it("reports unknown when the query itself failed", async () => {
    feieResponds({ ret: 1001, msg: "bad sign" });
    expect(await feieDriver.queryPrinter("SN1")).toBe("unknown");
  });
});
