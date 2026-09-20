import { describe, it, expect } from "vitest";
import { starCloudPrntDriver } from "./star-cloudprnt";

function pollRequest(body: unknown): Request {
  return new Request("https://printkit.test/api/cloudprnt/tok", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("star-cloudprnt: parsePoll", () => {
  it("reads the printer's MAC address", async () => {
    const info = await starCloudPrntDriver.parsePoll(
      pollRequest({ printerMAC: "00:11:62:aa:bb:cc", statusCode: "200 OK" }),
    );
    expect(info.deviceRef).toBe("001162aabbcc");
  });

  it("reports no device when the MAC is missing", async () => {
    const info = await starCloudPrntDriver.parsePoll(
      pollRequest({ statusCode: "200 OK" }),
    );
    expect(info.deviceRef).toBeNull();
  });

  it("normalises the MAC so case and separators cannot fork the binding", async () => {
    const info = await starCloudPrntDriver.parsePoll(
      pollRequest({ printerMAC: "00-11-62-AA-BB-CC" }),
    );
    expect(info.deviceRef).toBe("001162aabbcc");
  });

  it("survives a malformed body", async () => {
    const request = new Request("https://printkit.test/api/cloudprnt/tok", {
      method: "POST",
      body: "not json",
    });
    await expect(starCloudPrntDriver.parsePoll(request)).resolves.toEqual({
      deviceRef: null,
      ready: true,
    });
  });
});

describe("star-cloudprnt: pollResponse", () => {
  it("reports no job", async () => {
    const body = await starCloudPrntDriver.pollResponse(null).json();
    expect(body).toEqual({ jobReady: false });
  });

  it("advertises a waiting job as a PNG", async () => {
    const body = await starCloudPrntDriver.pollResponse({ id: "job-1" }).json();
    expect(body).toEqual({
      jobReady: true,
      mediaTypes: ["image/png"],
      jobToken: "job-1",
      deleteMethod: "DELETE",
    });
  });
});

describe("star-cloudprnt: parseConfirmation", () => {
  function confirm(query: string): Request {
    return new Request(`https://printkit.test/api/cloudprnt/tok?${query}`, {
      method: "DELETE",
    });
  }

  it("treats a 2xx-style code as printed", () => {
    expect(
      starCloudPrntDriver.parseConfirmation(confirm("token=job-1&code=200")),
    ).toEqual({ jobId: "job-1", outcome: "printed" });
  });

  it("treats OK as printed", () => {
    expect(
      starCloudPrntDriver.parseConfirmation(confirm("token=job-1&code=OK")),
    ).toEqual({ jobId: "job-1", outcome: "printed" });
  });

  it("treats a missing code as printed", () => {
    expect(
      starCloudPrntDriver.parseConfirmation(confirm("token=job-1")),
    ).toEqual({ jobId: "job-1", outcome: "printed" });
  });

  it("treats any other code as a failure", () => {
    expect(
      starCloudPrntDriver.parseConfirmation(confirm("token=job-1&code=500")),
    ).toEqual({ jobId: "job-1", outcome: "failed" });
  });

  it("reports no job id when the token is absent", () => {
    expect(starCloudPrntDriver.parseConfirmation(confirm("code=200"))).toEqual({
      jobId: null,
      outcome: "printed",
    });
  });
});

describe("star-cloudprnt: jobResponse", () => {
  it("returns the bytes with the media type the poll advertised", async () => {
    const res = starCloudPrntDriver.jobResponse(
      Buffer.from([1, 2, 3]),
      "image/png",
    );
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
});
