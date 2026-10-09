import { describe, expect, it, vi } from "vitest";
import { MAX_REQUEST_BODY_BYTES, readBoundedJson } from "./bounded-json";

function streamed(chunks: Uint8Array[], headers?: HeadersInit) {
  const cancel = vi.fn();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
    cancel,
  });
  const request = new Request("https://printkit.test/pair", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit);
  return { request, cancel, body };
}
const bytes = (value: string) => new TextEncoder().encode(value);

describe("bounded JSON", () => {
  it("accepts a valid request without content length", async () => {
    const { request } = streamed([bytes('{"code":"ABCD"}')]);
    await expect(readBoundedJson(request)).resolves.toEqual({ code: "ABCD" });
  });
  it("accepts exactly the byte limit", async () => {
    const input = '"' + "a".repeat(MAX_REQUEST_BODY_BYTES - 2) + '"';
    const { request } = streamed([bytes(input)]);
    await expect(readBoundedJson(request)).resolves.toHaveLength(
      MAX_REQUEST_BODY_BYTES - 2,
    );
  });
  it("rejects streamed oversized requests and cancels the reader", async () => {
    const { request, cancel, body } = streamed([
      new Uint8Array(8192),
      new Uint8Array(8193),
      bytes("unread"),
    ]);
    await expect(readBoundedJson(request)).rejects.toMatchObject({
      status: 413,
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
  it("does not trust an understated content length", async () => {
    const { request } = streamed([new Uint8Array(MAX_REQUEST_BODY_BYTES + 1)], {
      "content-length": "1",
    });
    await expect(readBoundedJson(request)).rejects.toMatchObject({
      status: 413,
    });
  });
  it("rejects declared oversized content before reading", async () => {
    const { request, cancel } = streamed([bytes("{}")], {
      "content-length": "99999",
    });
    await expect(readBoundedJson(request)).rejects.toMatchObject({
      status: 413,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("counts encoded bytes rather than string characters", async () => {
    const { request } = streamed([bytes('"' + "界".repeat(6000) + '"')]);
    await expect(readBoundedJson(request)).rejects.toMatchObject({
      status: 413,
    });
  });
  it.each(["-1", "2x", "1.5"])(
    "rejects invalid content length %s",
    async (declared) => {
      const { request } = streamed([bytes("{}")], {
        "content-length": declared,
      });
      await expect(readBoundedJson(request)).rejects.toMatchObject({
        status: 400,
      });
    },
  );
  it("rejects malformed JSON and releases the reader", async () => {
    const { request, body } = streamed([bytes("not json")]);
    await expect(readBoundedJson(request)).rejects.toMatchObject({
      status: 400,
    });
    expect(body.locked).toBe(false);
  });
});

it("rejects a missing body", async () => {
  await expect(
    readBoundedJson(
      new Request("https://printkit.test/pair", { method: "POST" }),
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("contains stream read errors", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("transport"));
    },
  });
  const request = new Request("https://printkit.test/pair", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  await expect(readBoundedJson(request)).rejects.toMatchObject({ status: 400 });
  expect(body.locked).toBe(false);
});
it("rejects malformed UTF-8 rather than replacing invalid bytes", async () => {
  const request = new Request("https://printkit.test/pair", {
    method: "POST",
    body: new Uint8Array([34, 255, 34]),
  });
  await expect(readBoundedJson(request)).rejects.toMatchObject({ status: 400 });
});
