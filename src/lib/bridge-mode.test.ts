// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { isBridgeModeEnabled, setBridgeModeEnabled } from "./bridge-mode";

describe("bridge-mode", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to disabled", () => {
    expect(isBridgeModeEnabled()).toBe(false);
  });

  it("persists enabling", () => {
    setBridgeModeEnabled(true);
    expect(isBridgeModeEnabled()).toBe(true);
  });

  it("persists disabling", () => {
    setBridgeModeEnabled(true);
    setBridgeModeEnabled(false);
    expect(isBridgeModeEnabled()).toBe(false);
  });

  it("treats a malformed stored value as disabled rather than throwing", () => {
    localStorage.setItem("printkit:bridge-mode", "not-json");
    expect(isBridgeModeEnabled()).toBe(false);
  });
});
