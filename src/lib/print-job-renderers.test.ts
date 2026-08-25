import { describe, it, expect } from "vitest";
import { getJobRenderer } from "./print-job-renderers";

// The actual canvas paint (renderLabelCanvas) needs a real 2D context jsdom
// doesn't implement -- verified by the manual hardware gate, same as
// label-render.test.ts's own scope. This only asserts the dispatch itself.
describe("getJobRenderer", () => {
  it("returns a renderer function for job_type 'label'", () => {
    expect(typeof getJobRenderer("label")).toBe("function");
  });

  it("returns null for an unknown job_type", () => {
    expect(getJobRenderer("receipt")).toBeNull();
  });
});
