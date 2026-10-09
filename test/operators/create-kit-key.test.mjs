import assert from "node:assert/strict";
import { test } from "node:test";
import { Readable } from "node:stream";
import {
  parseKeyOptions,
  readCallbackSecret,
} from "../../scripts/create-kit-key-input.mjs";
test("rotation without callback configuration retains omitted fields", () =>
  assert.deepEqual(parseKeyOptions(["qkit"]), {
    kitSlug: "qkit",
    callbackUrl: undefined,
    readSecret: false,
  }));
test("callback configuration uses a piped secret", () =>
  assert.deepEqual(
    parseKeyOptions([
      "qkit",
      "--callback-url",
      "https://qkit.merqo.io/api/printkit/print-status",
      "--callback-secret-stdin",
    ]),
    {
      kitSlug: "qkit",
      callbackUrl: "https://qkit.merqo.io/api/printkit/print-status",
      readSecret: true,
    },
  ));
for (const args of [
  ["QKIT"],
  ["qkit", "https://example.com", "plaintext"],
  ["qkit", "--callback-url", "http://example.com", "--callback-secret-stdin"],
  [
    "qkit",
    "--callback-url",
    "https://user:pass@example.com",
    "--callback-secret-stdin",
  ],
  ["qkit", "--callback-secret-stdin"],
  ["qkit", "--callback-url", "https://example.com"],
  ["qkit", "--callback-secret-stdin", "--callback-secret-stdin"],
])
  test("rejects unsafe callback arguments " + JSON.stringify(args), () =>
    assert.throws(() => parseKeyOptions(args)),
  );
test("reads only bounded piped input", async () =>
  assert.equal(
    await readCallbackSecret(Readable.from(["a".repeat(32), "\n"])),
    "a".repeat(32),
  ));
test("does not echo a secret in a terminal", async () =>
  await assert.rejects(
    readCallbackSecret({ isTTY: true }),
    /interactive input/,
  ));
test("rejects oversized input", async () =>
  await assert.rejects(
    readCallbackSecret(Readable.from(["a".repeat(4097)])),
    /too large/,
  ));
test("rejects empty or low entropy-length input", async () =>
  await assert.rejects(
    readCallbackSecret(Readable.from(["short"])),
    /32 to 256/,
  ));
