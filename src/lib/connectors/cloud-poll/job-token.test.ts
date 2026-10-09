import { expect, it } from "vitest";
import { cloudPollJobId, cloudPollJobToken } from "./job-token";
const revision = {
  id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-10-09T00:00:00.123456+00:00",
  requeued_at: null,
};
it("round-trips the job ID while retaining microsecond queue identity", () => {
  const token = cloudPollJobToken(revision);
  expect(cloudPollJobId(token)).toBe(revision.id);
  expect(
    cloudPollJobToken({
      ...revision,
      created_at: "2026-10-09T00:00:00.123457+00:00",
    }),
  ).not.toBe(token);
  expect(
    cloudPollJobToken({
      ...revision,
      requeued_at: "2026-10-09T00:00:01.123456+00:00",
    }),
  ).not.toBe(token);
});
it.each([
  null,
  "",
  revision.id,
  "v1." + revision.id + "." + "x".repeat(64),
  "v1." + "../job" + "." + "a".repeat(64),
])("rejects unsupported token %s", (token) => {
  expect(cloudPollJobId(token)).toBeNull();
});
