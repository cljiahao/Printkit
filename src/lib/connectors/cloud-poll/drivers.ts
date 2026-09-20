import { registerDriver, getDriverMeta } from "@/lib/connectors/registry";
import { starCloudPrntDriver } from "@/lib/connectors/cloud-poll/star-cloudprnt";
import type { CloudPollDriver } from "@/lib/connectors/types";

const DRIVERS: CloudPollDriver[] = [starCloudPrntDriver];

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
 * Every driver on this connector, by id. The route looks a printer's driver
 * up here; an id with no driver means the model is in the catalog but its
 * driver has not been built yet.
 */
export function getCloudPollDriver(id: string): CloudPollDriver | null {
  return DRIVERS.find((driver) => driver.id === id) ?? null;
}
