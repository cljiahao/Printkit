import { registerDriver, getDriverMeta } from "@/lib/connectors/registry";
import { feieDriver } from "@/lib/connectors/vendor-cloud/feie";
import type { VendorCloudDriver } from "@/lib/connectors/types";

const DRIVERS: VendorCloudDriver[] = [feieDriver];

for (const driver of DRIVERS) {
  if (!getDriverMeta(driver.id)) {
    registerDriver({
      id: driver.id,
      connector: driver.connector,
      outputFormat: driver.outputFormat,
    });
  }
}

/**
 * Every driver on this connector, by id. An id with no driver means the
 * model is in the catalog but its driver has not been built yet.
 */
export function getVendorCloudDriver(id: string): VendorCloudDriver | null {
  return DRIVERS.find((driver) => driver.id === id) ?? null;
}
