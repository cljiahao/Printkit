import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PrintkitClient, UnauthorizedError } from "./client";

const BASE = "https://printkit.test";

function responds(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PrintkitClient.pair", () => {
  it("trades a code for a token", async () => {
    const fetchMock = responds(
      () => new Response(JSON.stringify({ token: "agent-token" })),
    );

    expect(await PrintkitClient.pair(BASE, "ABCD-2345")).toBe("agent-token");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://printkit.test/api/v1/bridge-agent/pair",
    );
  });

  it("explains a rejected code in words a vendor can act on", async () => {
    responds(() => new Response("{}", { status: 401 }));

    await expect(PrintkitClient.pair(BASE, "ABCD-2345")).rejects.toThrow(
      /not valid any more/i,
    );
  });
});

describe("PrintkitClient.nextJob", () => {
  it("returns null when there is nothing to print", async () => {
    responds(() => new Response(null, { status: 204 }));
    const client = new PrintkitClient(BASE, "agent-token");

    expect(await client.nextJob()).toBeNull();
  });

  it("returns the claimed job", async () => {
    responds(() => new Response(JSON.stringify({ job_id: "job-1" })));
    const client = new PrintkitClient(BASE, "agent-token");

    expect(await client.nextJob()).toEqual({ jobId: "job-1" });
  });

  it("sends the agent token", async () => {
    const fetchMock = responds(() => new Response(null, { status: 204 }));
    await new PrintkitClient(BASE, "agent-token").nextJob();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer agent-token",
    );
  });

  it("reports being unpaired distinctly from other failures", async () => {
    responds(() => new Response("{}", { status: 401 }));
    const client = new PrintkitClient(BASE, "agent-token");

    await expect(client.nextJob()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("PrintkitClient.fetchLabel", () => {
  it("returns the label bytes", async () => {
    responds(() => new Response(new Uint8Array([1, 2, 3])));
    const client = new PrintkitClient(BASE, "agent-token");

    expect(await client.fetchLabel("job-1")).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("fails loudly on a server error", async () => {
    responds(() => new Response("", { status: 500 }));
    const client = new PrintkitClient(BASE, "agent-token");

    await expect(client.fetchLabel("job-1")).rejects.toThrow(/500/);
  });
});

describe("PrintkitClient.reportResult", () => {
  it("posts the outcome", async () => {
    const fetchMock = responds(() => new Response("{}"));
    await new PrintkitClient(BASE, "agent-token").reportResult(
      "job-1",
      "printed",
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://printkit.test/api/v1/bridge-agent/jobs/job-1/result",
    );
    expect(init.body).toBe(JSON.stringify({ result: "printed" }));
  });
});
