import type { DriverMeta } from "@/lib/connectors/types";

const registry = new Map<string, DriverMeta>();

/**
 * Drivers register themselves when their module loads. The registry holds
 * metadata only; the protocol code stays in each driver's own module and is
 * imported by that connector's routes, so a catalog entry can name a driver
 * that has not been built yet without breaking the build.
 */
export function registerDriver(meta: DriverMeta): void {
  if (registry.has(meta.id)) {
    throw new Error(`Driver ${meta.id} is already registered`);
  }
  registry.set(meta.id, meta);
}

export function getDriverMeta(id: string): DriverMeta | null {
  return registry.get(id) ?? null;
}

export function listDriverMeta(): DriverMeta[] {
  return [...registry.values()];
}

export function isDriverAvailable(id: string): boolean {
  return registry.has(id);
}

/**
 * Test-only: clears registrations between cases.
 */
export function resetDriverRegistry(): void {
  registry.clear();
}
