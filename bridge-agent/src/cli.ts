#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises";
import { PrintkitClient } from "./client.js";
import { readConfig, writeConfig, configPath } from "./config.js";
import { runLoop } from "./loop.js";
import { createBluetoothPrinter } from "./printer.js";

const DEFAULT_BASE_URL = "https://printkit.merqo.io";

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function pair(code: string): Promise<void> {
  if (!code) fail("Usage: printkit-bridge pair <code>");
  const baseUrl = process.env.PRINTKIT_URL ?? DEFAULT_BASE_URL;

  const token = await PrintkitClient.pair(baseUrl, code);
  const existing = await readConfig();
  await writeConfig({ baseUrl, token, printer: existing?.printer });

  log(`Paired. Settings saved to ${configPath()}`);
  log("Next: printkit-bridge use <printer name>");
}

async function choosePrinter(name: string, model: string): Promise<void> {
  if (!name) fail("Usage: printkit-bridge use <printer name> [model]");
  const config = await readConfig();
  if (!config) fail("Not paired yet. Run: printkit-bridge pair <code>");

  await writeConfig({ ...config, printer: { name, model: model || "B1" } });
  log(`Printer set to ${name} (${model || "B1"})`);
}

async function run(): Promise<void> {
  const config = await readConfig();
  if (!config) fail("Not paired yet. Run: printkit-bridge pair <code>");
  if (!config.printer) {
    fail("No printer chosen yet. Run: printkit-bridge use <printer name>");
  }

  const client = new PrintkitClient(config.baseUrl, config.token);
  const printer = createBluetoothPrinter({
    address: config.printer.name,
    model: config.printer.model,
    log,
  });

  log("Waiting for print jobs. Press Ctrl+C to stop.");
  await runLoop({
    client,
    printer,
    log,
    sleep: (ms) => delay(ms),
  });
}

function usage(): void {
  log("printkit-bridge <command>");
  log("");
  log("  pair <code>            Pair this device with a printer in printkit");
  log("  use <name> [model]     Choose which Bluetooth printer to print on");
  log("  run                    Print jobs until stopped");
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "pair":
      await pair(args[0] ?? "");
      return;
    case "use":
      await choosePrinter(args[0] ?? "", args[1] ?? "");
      return;
    case "run":
      await run();
      return;
    default:
      usage();
  }
}

main().catch((err: unknown) => {
  fail(String(err));
});
