import { describe, it, expect } from "vitest";
import { NIIMBOT_MODELS, DEFAULT_NIIMBOT_MODEL } from "./niimbot-model";

describe("niimbot-model", () => {
  it("defaults to B1, matching the only currently-supported model", () => {
    expect(DEFAULT_NIIMBOT_MODEL).toBe("B1");
  });

  it("has a printDirection of 'top' for B1", () => {
    expect(NIIMBOT_MODELS.B1.printDirection).toBe("top");
  });
});
