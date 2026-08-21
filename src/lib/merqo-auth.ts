import { timingSafeEqual } from "node:crypto";

/** Constant-time check that `request`'s bearer token equals `secret`. */
function bearerMatches(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

/** Constant-time bearer check against MERQO_METRICS_SECRET. */
export function bearerOk(request: Request): boolean {
  return bearerMatches(request, process.env.MERQO_METRICS_SECRET);
}

/** Constant-time bearer check against MERQO_PROVISION_SECRET — deliberately a
 *  DIFFERENT env var from bearerOk's MERQO_METRICS_SECRET, matching qkit/
 *  loopkit's convention: a leak of the routine metrics-polling secret must
 *  not also grant access to the provision route. */
export function provisionBearerOk(request: Request): boolean {
  return bearerMatches(request, process.env.MERQO_PROVISION_SECRET);
}
