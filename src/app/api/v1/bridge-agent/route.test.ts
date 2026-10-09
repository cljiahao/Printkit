import { describe, it, expect, vi, beforeEach } from "vitest";

const redeemPairingCodeMock = vi.fn();
vi.mock("@/lib/bridge-pairing", () => ({
  redeemPairingCode: (...args: unknown[]) => redeemPairingCodeMock(...args),
}));

const mintDeviceCredentialMock = vi.fn();
vi.mock("@/lib/device-credentials", () => ({
  mintDeviceCredential: (...args: unknown[]) =>
    mintDeviceCredentialMock(...args),
}));

const resolveAgentMock = vi.fn();
vi.mock("@/lib/agent-auth", () => ({
  resolveAgent: (...args: unknown[]) => resolveAgentMock(...args),
}));

const claimJobMock = vi.fn();
const sweepLocationMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/job-dispatch", () => ({
  claimJob: (...args: unknown[]) => claimJobMock(...args),
  sweepLocation: (...args: unknown[]) => sweepLocationMock(...args),
}));

const touchPrinterSeenMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/printers", () => ({
  touchPrinterSeen: (...args: unknown[]) => touchPrinterSeenMock(...args),
}));

const renderJobForPrinterMock = vi.fn();
vi.mock("@/lib/render-job", () => ({
  renderJobForPrinter: (...args: unknown[]) => renderJobForPrinterMock(...args),
}));

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

import { POST as pair } from "./pair/route";
import { GET as nextJob } from "./next-job/route";
import { GET as label } from "./jobs/[id]/label/route";
import { POST as result } from "./jobs/[id]/result/route";

const printer = {
  id: "printer-1",
  vendor_id: "vendor-1",
  location_id: "loc-1",
  catalog_id: "niimbot-b1",
  connector: "bridge",
  driver: "niimbot",
  display_name: "NIIMBOT B1",
  label_width_mm: 50,
  label_height_mm: 30,
  device_ref: null,
  last_seen_at: null,
  created_at: "2026-09-20T00:00:00.000Z",
};

const ATTEMPT = "2026-10-08T00:00:00.123456+00:00";
const context = { params: Promise.resolve({ id: "job-1" }) };

function agentRequest(init?: RequestInit) {
  return new Request("https://printkit.test/api/v1/bridge-agent/next-job", {
    headers: { authorization: "Bearer agent-token" },
    ...init,
  });
}

const eqFilters: Array<[string, unknown]> = [];

function jobReturns(job: unknown, error: unknown = null) {
  eqFilters.length = 0;
  const query = {
    eq: (column: string, value: unknown) => {
      eqFilters.push([column, value]);
      return query;
    },
    maybeSingle: () => Promise.resolve({ data: job, error }),
  };
  selectMock.mockReturnValue(query);
}

beforeEach(() => {
  redeemPairingCodeMock.mockReset();
  mintDeviceCredentialMock.mockReset().mockResolvedValue("agent-token");
  resolveAgentMock.mockReset().mockResolvedValue(printer);
  claimJobMock.mockReset().mockResolvedValue(null);
  sweepLocationMock.mockClear();
  touchPrinterSeenMock.mockClear();
  renderJobForPrinterMock.mockReset().mockResolvedValue(Buffer.from([1, 2, 3]));
  updatePrintJobStatusMock.mockReset().mockResolvedValue({ ok: true });
  selectMock.mockReset();
});

describe("POST /api/v1/bridge-agent/pair", () => {
  function pairRequest(body: unknown) {
    return new Request("https://printkit.test/api/v1/bridge-agent/pair", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("rejects oversized input before querying pairing storage", async () => {
    const response = await pair(
      new Request("https://printkit.test/pair", {
        method: "POST",
        body: "x".repeat(16385),
      }),
    );
    expect(response.status).toBe(413);
    expect(redeemPairingCodeMock).not.toHaveBeenCalled();
    expect(mintDeviceCredentialMock).not.toHaveBeenCalled();
  });

  it("trades a valid code for an agent token", async () => {
    redeemPairingCodeMock.mockResolvedValue("printer-1");

    const res = await pair(pairRequest({ code: "ABCD-2345" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ token: "agent-token" });
    expect(mintDeviceCredentialMock).toHaveBeenCalledWith(
      "printer-1",
      "bridge_agent_token",
    );
  });

  it("refuses a code that is unknown, used or expired", async () => {
    redeemPairingCodeMock.mockResolvedValue(null);

    const res = await pair(pairRequest({ code: "ABCD-2345" }));

    expect(res.status).toBe(401);
    expect(mintDeviceCredentialMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    const res = await pair(
      new Request("https://printkit.test/api/v1/bridge-agent/pair", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/bridge-agent/next-job", () => {
  it("rejects a request with no valid token", async () => {
    resolveAgentMock.mockResolvedValue(null);
    expect((await nextJob(agentRequest())).status).toBe(401);
  });

  it("answers 204 when there is nothing to print", async () => {
    const res = await nextJob(agentRequest());

    expect(res.status).toBe(204);
    expect(sweepLocationMock).toHaveBeenCalledWith("loc-1");
    expect(touchPrinterSeenMock).toHaveBeenCalledWith(printer);
  });

  it("claims one job at the agent's own booth", async () => {
    claimJobMock.mockResolvedValue({ id: "job-1", sent_at: ATTEMPT });

    const res = await nextJob(agentRequest());

    expect(claimJobMock).toHaveBeenCalledWith("loc-1");
    expect(await res.json()).toEqual({ job_id: "job-1", sent_at: ATTEMPT });
  });
});

describe("GET /api/v1/bridge-agent/jobs/[id]/label", () => {
  it("rejects a request with no valid token", async () => {
    resolveAgentMock.mockResolvedValue(null);
    expect((await label(agentRequest(), context)).status).toBe(401);
  });

  it("serves the label for a job this agent claimed", async () => {
    jobReturns({ id: "job-1", payload: {}, status: "sent" });

    const res = await label(agentRequest(), context);

    expect(res.headers.get("content-type")).toBe("image/png");
    expect(renderJobForPrinterMock).toHaveBeenCalledWith({}, printer);
  });

  it("404s a job at another booth", async () => {
    jobReturns(null);
    expect((await label(agentRequest(), context)).status).toBe(404);
  });

  it("404s a job this agent has not claimed", async () => {
    jobReturns({ id: "job-1", payload: {}, status: "queued" });
    expect((await label(agentRequest(), context)).status).toBe(404);
  });
});

describe("POST /api/v1/bridge-agent/jobs/[id]/result", () => {
  function resultRequest(body: Record<string, unknown>) {
    return new Request(
      "https://printkit.test/api/v1/bridge-agent/jobs/job-1/result",
      {
        method: "POST",
        headers: { authorization: "Bearer agent-token" },
        body: JSON.stringify({ sent_at: ATTEMPT, ...body }),
      },
    );
  }

  it("rejects a request with no valid token", async () => {
    resolveAgentMock.mockResolvedValue(null);
    expect(
      (await result(resultRequest({ result: "printed" }), context)).status,
    ).toBe(401);
  });

  it("records a successful print", async () => {
    jobReturns({ id: "job-1", status: "sent", sent_at: ATTEMPT });

    await result(resultRequest({ result: "printed" }), context);

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-1",
      "printed",
      undefined,
      { locationId: "loc-1", expectedStatus: "sent", sentAt: ATTEMPT },
    );
  });

  it("records a failure with its reason", async () => {
    jobReturns({ id: "job-1", status: "sent", sent_at: ATTEMPT });

    await result(resultRequest({ result: "failed" }), context);

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-1",
      "failed",
      "device_reported_error",
      { locationId: "loc-1", expectedStatus: "sent", sentAt: ATTEMPT },
    );
  });

  it("only settles a job that is still waiting for its result", async () => {
    jobReturns({ id: "job-1", status: "sent", sent_at: ATTEMPT });

    await result(resultRequest({ result: "printed" }), context);

    expect(eqFilters).toContainEqual(["sent_at", ATTEMPT]);
    expect(eqFilters).toContainEqual(["location_id", printer.location_id]);
  });

  it("refuses to report on another booth's job", async () => {
    jobReturns(null);

    const res = await result(resultRequest({ result: "printed" }), context);

    expect(res.status).toBe(404);
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown outcome", async () => {
    jobReturns({ id: "job-1", status: "sent", sent_at: ATTEMPT });

    const res = await result(resultRequest({ result: "maybe" }), context);

    expect(res.status).toBe(400);
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });
});

it("does not acknowledge an agent result when persistence fails", async () => {
  jobReturns({ id: "job-1", status: "sent", sent_at: ATTEMPT });
  updatePrintJobStatusMock.mockResolvedValueOnce({
    ok: false,
    error: "Could not update print job status.",
  });
  const response = await result(
    agentRequest({
      method: "POST",
      body: JSON.stringify({ result: "printed", sent_at: ATTEMPT }),
    }),
    context,
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: "Could not update print job status.",
  });
});

it.each(["printed", "failed"] as const)(
  "acknowledges same-attempt %s retries without writing",
  async (status) => {
    jobReturns({ id: "job-1", status, sent_at: ATTEMPT });
    const response = await result(
      agentRequest({
        method: "POST",
        body: JSON.stringify({ result: status, sent_at: ATTEMPT }),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  },
);

it("rejects a stale agent report after the same job is reclaimed", async () => {
  const current = {
    id: "job-1",
    status: "sent",
    sent_at: "2026-10-08T00:00:01.123456+00:00",
  };
  jobReturns(current);
  const chain = selectMock();
  chain.maybeSingle = () =>
    Promise.resolve({
      data:
        Object.fromEntries(eqFilters).sent_at === current.sent_at
          ? current
          : null,
      error: null,
    });
  const stale = await result(
    agentRequest({
      method: "POST",
      body: JSON.stringify({ result: "failed", sent_at: ATTEMPT }),
    }),
    context,
  );
  expect(stale.status).toBe(404);
  expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  eqFilters.length = 0;
  const fresh = await result(
    agentRequest({
      method: "POST",
      body: JSON.stringify({ result: "printed", sent_at: current.sent_at }),
    }),
    context,
  );
  expect(fresh.status).toBe(200);
  expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
    "job-1",
    "printed",
    undefined,
    { locationId: "loc-1", expectedStatus: "sent", sentAt: current.sent_at },
  );
});

it.each([
  undefined,
  "not-a-date",
  "2026-02-30T00:00:00Z",
  "2026-10-08T00:00:00.1234567Z",
])("rejects an invalid or missing attempt %s", async (sent_at) => {
  const response = await result(
    agentRequest({
      method: "POST",
      body: JSON.stringify({ result: "printed", sent_at }),
    }),
    context,
  );
  expect(response.status).toBe(400);
  expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  expect(selectMock).not.toHaveBeenCalled();
});

it("refuses the opposite terminal result within the same attempt", async () => {
  jobReturns({ id: "job-1", status: "printed", sent_at: ATTEMPT });
  const response = await result(
    agentRequest({
      method: "POST",
      body: JSON.stringify({ result: "failed", sent_at: ATTEMPT }),
    }),
    context,
  );
  expect(response.status).toBe(409);
  expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
});
