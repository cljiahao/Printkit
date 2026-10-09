import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync, createSign } from "node:crypto";

const { verifySpy } = vi.hoisted(() => ({ verifySpy: vi.fn() }));
vi.mock("node:crypto", async () => {
  const actual =
    await vi.importActual<typeof import("node:crypto")>("node:crypto");
  return {
    ...actual,
    createVerify: (...args: Parameters<typeof actual.createVerify>) => {
      verifySpy();
      return actual.createVerify(...args);
    },
  };
});

const updatePrintJobStatusMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/print-jobs", () => ({
  updatePrintJobStatus: (...args: unknown[]) =>
    updatePrintJobStatusMock(...args),
}));

const selectMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({ from: () => ({ select: selectMock }) }),
}));

import { POST } from "./route";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function signed(fields: { orderId: string; status: string; stime: string }) {
  const signer = createSign("RSA-SHA256");
  // Feie's documented form: fields sorted by name, joined as name=value&...
  signer.update(
    `orderId=${fields.orderId}&status=${fields.status}&stime=${fields.stime}`,
    "utf8",
  );
  signer.end();
  return signer.sign(privateKey, "base64");
}

function callback(
  fields: { orderId: string; status: string; stime: string },
  signature = signed(fields),
): Request {
  const body = new FormData();
  body.set("orderId", fields.orderId);
  body.set("status", fields.status);
  body.set("stime", fields.stime);
  body.set("sign", signature);
  return new Request("https://printkit.test/api/feie/callback", {
    method: "POST",
    body,
  });
}

function jobFound(id: string | null, status = "sent") {
  selectMock.mockReturnValue({
    eq: () => ({
      maybeSingle: () =>
        Promise.resolve({ data: id ? { id, status } : null, error: null }),
    }),
  });
}

beforeEach(() => {
  process.env.FEIE_CALLBACK_PUBLIC_KEY = publicKey;
  verifySpy.mockClear();
  selectMock.mockClear();
  updatePrintJobStatusMock.mockClear();
  jobFound("job-1");
});

afterEach(() => {
  delete process.env.FEIE_CALLBACK_PUBLIC_KEY;
});

const fields = { orderId: "order-9", status: "1", stime: "1789000000" };

describe("POST /api/feie/callback", () => {
  it("marks the job printed on a valid signature", async () => {
    const res = await POST(callback(fields));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("SUCCESS");
    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-1",
      "printed",
      undefined,
      { expectedStatus: "sent", driverRef: "order-9" },
    );
  });

  it("rejects a signature over the fields simply concatenated", async () => {
    const signer = createSign("RSA-SHA256");
    signer.update(`${fields.orderId}${fields.status}${fields.stime}`, "utf8");
    signer.end();

    const res = await POST(callback(fields, signer.sign(privateKey, "base64")));

    expect(res.status).toBe(401);
  });

  it("marks the job failed when the maker reports a failure", async () => {
    const failure = { ...fields, status: "0" };
    await POST(callback(failure));

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-1",
      "failed",
      "device_reported_error",
      { expectedStatus: "sent", driverRef: "order-9" },
    );
  });

  it("rejects a forged signature and changes nothing", async () => {
    const res = await POST(callback(fields, "not-a-signature"));

    expect(res.status).toBe(401);
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("rejects a signature made for different fields", async () => {
    const other = signed({ ...fields, orderId: "order-other" });
    const res = await POST(callback(fields, other));

    expect(res.status).toBe(401);
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("rejects everything when no public key is configured", async () => {
    delete process.env.FEIE_CALLBACK_PUBLIC_KEY;

    const res = await POST(callback(fields));

    expect(res.status).toBe(401);
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("accepts an unknown job without changing anything, so the maker stops retrying", async () => {
    jobFound(null);

    const res = await POST(callback(fields));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("SUCCESS");
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("rejects a body with no signature at all", async () => {
    const body = new FormData();
    body.set("orderId", "order-9");
    const res = await POST(
      new Request("https://printkit.test/api/feie/callback", {
        method: "POST",
        body,
      }),
    );

    expect(res.status).toBe(401);
  });
});

it("asks Feie to retry a failed lookup instead of losing the result", async () => {
  selectMock.mockReturnValue({
    eq: () => ({
      maybeSingle: () =>
        Promise.resolve({ data: null, error: { message: "unavailable" } }),
    }),
  });
  expect((await POST(callback(fields))).status).toBe(500);
  expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
});

it("asks Feie to retry when the result could not be persisted", async () => {
  updatePrintJobStatusMock.mockResolvedValueOnce({
    ok: false,
    error: "Could not update print job status.",
  });
  expect((await POST(callback(fields))).status).toBe(500);
});

it.each(["queued", "printed", "failed"])(
  "acknowledges a stale Feie callback for a %s job without changing it",
  async (status) => {
    jobFound("job-1", status);
    const response = await POST(callback(fields));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("SUCCESS");
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  },
);

it.each([undefined, "1", "99999"])(
  "rejects oversized form input with length %s before crypto or storage",
  async (length) => {
    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
    };
    if (length !== undefined) headers["content-length"] = length;
    const response = await POST(
      new Request("https://printkit.test/callback", {
        method: "POST",
        headers,
        body: "x=" + "a".repeat(16385),
      }),
    );
    expect(response.status).toBe(413);
    expect(verifySpy).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  },
);
it("preserves signed URL-encoded callbacks as well as multipart forms", async () => {
  const body = new URLSearchParams({ ...fields, sign: signed(fields) });
  const response = await POST(
    new Request("https://printkit.test/callback", { method: "POST", body }),
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("SUCCESS");
  expect(verifySpy).toHaveBeenCalledOnce();
  expect(updatePrintJobStatusMock).toHaveBeenCalled();
});
it("returns400 for a malformed form content type before crypto or storage", async () => {
  const response = await POST(
    new Request("https://printkit.test/callback", {
      method: "POST",
      body: "raw",
    }),
  );
  expect(response.status).toBe(400);
  expect(verifySpy).not.toHaveBeenCalled();
  expect(selectMock).not.toHaveBeenCalled();
});
