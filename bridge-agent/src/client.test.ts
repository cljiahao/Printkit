import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PrintkitClient, UnauthorizedError } from "./client";

const BASE = "https://printkit.test";
const TOKEN = "x".repeat(43);
const JOB = "3f2b8c1e-9d4a-4b7e-8a61-2c5d7e9f0a13";

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
      () => new Response(JSON.stringify({ token: TOKEN })),
    );

    expect(await PrintkitClient.pair(BASE, "ABCD-2345")).toBe(TOKEN);
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
    const client = new PrintkitClient(BASE, TOKEN);

    expect(await client.nextJob()).toBeNull();
  });

  it("returns the claimed job", async () => {
    responds(() => new Response(JSON.stringify({ job_id: JOB })));
    const client = new PrintkitClient(BASE, TOKEN);

    expect(await client.nextJob()).toEqual({ jobId: JOB });
  });

  it("sends the agent token", async () => {
    const fetchMock = responds(() => new Response(null, { status: 204 }));
    await new PrintkitClient(BASE, TOKEN).nextJob();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("reports being unpaired distinctly from other failures", async () => {
    responds(() => new Response("{}", { status: 401 }));
    const client = new PrintkitClient(BASE, TOKEN);

    await expect(client.nextJob()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("PrintkitClient.fetchLabel", () => {
  it("returns the label bytes", async () => {
    responds(() => new Response(new Uint8Array([1, 2, 3])));
    const client = new PrintkitClient(BASE, TOKEN);

    expect(await client.fetchLabel(JOB)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("fails loudly on a server error", async () => {
    responds(() => new Response("", { status: 500 }));
    const client = new PrintkitClient(BASE, TOKEN);

    await expect(client.fetchLabel(JOB)).rejects.toThrow(/500/);
  });
});

describe("PrintkitClient.reportResult", () => {
  it("posts the outcome", async () => {
    const fetchMock = responds(() => new Response("{}"));
    await new PrintkitClient(BASE, TOKEN).reportResult(JOB, "printed");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://printkit.test/api/v1/bridge-agent/jobs/${JOB}/result`,
    );
    expect(init.body).toBe(JSON.stringify({ result: "printed" }));
  });
});

describe("PrintkitClient input checks", () => {
  it("refuses a plain-HTTP printkit address off this machine", () => {
    expect(() => new PrintkitClient("http://printkit.test", TOKEN)).toThrow(
      /https/,
    );
  });

  it("allows plain HTTP to this machine for development", () => {
    expect(
      () => new PrintkitClient("http://localhost:3000", TOKEN),
    ).not.toThrow();
  });

  it("refuses a token that is not in printkit's format", () => {
    expect(() => new PrintkitClient(BASE, "bad token\r\nx: y")).toThrow(
      /expected format/,
    );
  });

  it("refuses a job id that is not a UUID", async () => {
    responds(() => new Response(JSON.stringify({ job_id: "../../admin" })));

    await expect(new PrintkitClient(BASE, TOKEN).nextJob()).rejects.toThrow(
      /unexpected format/,
    );
  });

  it("refuses a malformed token from pairing", async () => {
    responds(() => new Response(JSON.stringify({ token: "short" })));

    await expect(PrintkitClient.pair(BASE, "ABCD-2345")).rejects.toThrow(
      /expected format/,
    );
  });
});
