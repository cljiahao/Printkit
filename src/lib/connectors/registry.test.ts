import { describe, it, expect, beforeEach } from "vitest";
import {
  registerDriver,
  getDriverMeta,
  listDriverMeta,
  isDriverAvailable,
  resetDriverRegistry,
} from "./registry";

describe("driver registry", () => {
  beforeEach(() => {
    resetDriverRegistry();
  });

  it("returns null for an unregistered driver", () => {
    expect(getDriverMeta("star-cloudprnt")).toBeNull();
    expect(isDriverAvailable("star-cloudprnt")).toBe(false);
  });

  it("finds a registered driver by id", () => {
    registerDriver({
      id: "star-cloudprnt",
      connector: "cloud_poll",
      outputFormat: "png",
    });

    expect(getDriverMeta("star-cloudprnt")).toEqual({
      id: "star-cloudprnt",
      connector: "cloud_poll",
      outputFormat: "png",
    });
    expect(isDriverAvailable("star-cloudprnt")).toBe(true);
    expect(listDriverMeta()).toHaveLength(1);
  });

  it("rejects a second driver registered under the same id", () => {
    registerDriver({
      id: "feie",
      connector: "vendor_cloud",
      outputFormat: "markup",
    });

    expect(() =>
      registerDriver({
        id: "feie",
        connector: "vendor_cloud",
        outputFormat: "markup",
      }),
    ).toThrow(/already registered/);
  });

  it("keeps drivers of different connectors apart", () => {
    registerDriver({
      id: "feie",
      connector: "vendor_cloud",
      outputFormat: "markup",
    });
    registerDriver({
      id: "niimbot",
      connector: "bridge",
      outputFormat: "png",
    });

    expect(getDriverMeta("feie")?.connector).toBe("vendor_cloud");
    expect(getDriverMeta("niimbot")?.connector).toBe("bridge");
    expect(listDriverMeta()).toHaveLength(2);
  });
});
