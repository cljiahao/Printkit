import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readConfig, writeConfig } from "./config";
const fs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  chmod: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ ...fs, default: fs }));
vi.mock("node:os", () => ({
  homedir: () => "synthetic-home",
  default: { homedir: () => "synthetic-home" },
}));
const config = {
  baseUrl: "https://test.invalid",
  token: "synthetic-device-token",
  printer: { name: "Fixture printer", model: "niimbot-b1" },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PRINTKIT_BRIDGE_HOME", "synthetic-config");
  fs.readFile.mockResolvedValue(JSON.stringify(config));
});
afterEach(() => vi.unstubAllEnvs());
describe("agent configuration", () => {
  it("reads the typed printer binding from the configured directory", async () => {
    expect(await readConfig()).toEqual(config);
    expect(fs.readFile).toHaveBeenCalledWith(
      join("synthetic-config", "config.json"),
      "utf8",
    );
  });
  it("uses the home-directory default when no override is supplied", async () => {
    vi.stubEnv("PRINTKIT_BRIDGE_HOME", undefined);
    await readConfig();
    expect(fs.readFile).toHaveBeenCalledWith(
      join("synthetic-home", ".printkit-bridge", "config.json"),
      "utf8",
    );
  });
  it.each([
    { token: "x" },
    { baseUrl: "https://test.invalid" },
    { baseUrl: 1, token: "x" },
    { baseUrl: "https://test.invalid", token: 1 },
    null,
  ])("rejects malformed required fields: %j", async (value) => {
    fs.readFile.mockResolvedValue(JSON.stringify(value));
    expect(await readConfig()).toBeNull();
  });
  it.each([
    undefined,
    null,
    {},
    { name: 1, model: "b1" },
    { name: "Printer", model: 1 },
  ])("ignores an invalid optional printer binding: %j", async (printer) => {
    fs.readFile.mockResolvedValue(
      JSON.stringify({ baseUrl: config.baseUrl, token: config.token, printer }),
    );
    expect(await readConfig()).toEqual({
      baseUrl: config.baseUrl,
      token: config.token,
      printer: undefined,
    });
  });
  it("handles corrupt JSON and unreadable configuration", async () => {
    fs.readFile
      .mockResolvedValueOnce("{broken")
      .mockRejectedValueOnce(new Error("unreadable"));
    expect(await readConfig()).toBeNull();
    expect(await readConfig()).toBeNull();
  });
  it("creates private storage and reapplies private file permissions", async () => {
    await writeConfig(config);
    expect(fs.mkdir).toHaveBeenCalledWith("synthetic-config", {
      recursive: true,
      mode: 0o700,
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      join("synthetic-config", "config.json"),
      JSON.stringify(config, null, 2),
      { encoding: "utf8", mode: 0o600 },
    );
    expect(fs.chmod).toHaveBeenCalledWith(
      join("synthetic-config", "config.json"),
      0o600,
    );
  });
  it("surfaces write and permission failures instead of reporting successful pairing", async () => {
    fs.writeFile.mockRejectedValueOnce(new Error("disk full"));
    await expect(writeConfig(config)).rejects.toThrow("disk full");
    expect(fs.chmod).not.toHaveBeenCalled();
    fs.chmod.mockRejectedValueOnce(new Error("permission denied"));
    await expect(writeConfig(config)).rejects.toThrow("permission denied");
  });
});
