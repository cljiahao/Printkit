import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type AgentConfig = {
  baseUrl: string;
  token: string;
  printer?: { name: string; model: string };
};

export function configDir(): string {
  return (
    process.env.PRINTKIT_BRIDGE_HOME ?? path.join(homedir(), ".printkit-bridge")
  );
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export async function readConfig(): Promise<AgentConfig | null> {
  try {
    const raw = await readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.baseUrl !== "string" ||
      typeof parsed.token !== "string"
    ) {
      return null;
    }
    const printer = parsed.printer as Record<string, unknown> | undefined;
    const validPrinter =
      typeof printer?.name === "string" && typeof printer.model === "string"
        ? { name: printer.name, model: printer.model }
        : undefined;
    return {
      baseUrl: parsed.baseUrl,
      token: parsed.token,
      printer: validPrinter,
    };
  } catch {
    return null;
  }
}

/**
 * The file holds this device's agent token, so it is written owner-only.
 * Anyone who can read it can print to that one printer.
 */
export async function writeConfig(config: AgentConfig): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  await writeFile(configPath(), JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(configPath(), 0o600);
}
