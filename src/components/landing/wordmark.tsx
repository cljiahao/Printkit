import { cn } from "@/lib/utils";

/** PayKit wordmark. PascalCase compound (Apple's -Kit-style precedent,
 *  matching qkit/loopkit's logo-mark convention) with a mint-green accent
 *  on "Pay" — a clean money association, distinct from qkit's ember and
 *  loopkit's gold. This is the visual mark only; every other surface
 *  (titles, prose, docs, slugs) stays lowercase "paykit" per
 *  docs/business/2026-07-15-kit-brand-naming-convention.md. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("font-display font-semibold tracking-tight", className)}
    >
      <span className="text-mint">Pay</span>Kit
    </span>
  );
}
