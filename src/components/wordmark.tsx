import { cn } from "@/lib/utils";

/** printkit wordmark. PascalCase compound (Apple's -Kit-style precedent,
 *  matching qkit/loopkit's logo-mark convention) with a mint-green accent
 *  on "Print" — this is the visual mark only; every other surface
 *  (titles, prose, docs, slugs) stays lowercase "printkit" per
 *  docs/business/2026-07-15-kit-brand-naming-convention.md. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("font-display font-semibold tracking-tight", className)}
    >
      <span className="text-mint">Print</span>Kit
    </span>
  );
}
