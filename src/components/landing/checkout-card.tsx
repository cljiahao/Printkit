import { Badge } from "@/components/ui/badge";

/** Decorative "live checkout" artifact for the hero — not a real scannable
 *  QR, a stylized stand-in for the thing paykit actually generates. The
 *  status pill is the Tabaous-inspired piece of this design: a small,
 *  honest status badge (the same pending/claimed/confirmed language the
 *  product itself uses), not a literal QR-scanning animation. */
export function CheckoutCard() {
  return (
    <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-lg shadow-foreground/5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Checkout
        </span>
        <Badge variant="outline" className="font-mono text-[10px]">
          via any kit
        </Badge>
      </div>

      <div
        className="mt-4 grid grid-cols-6 gap-1 rounded-lg bg-muted p-4"
        aria-hidden
      >
        {QR_PATTERN.map((row, i) =>
          row.map((on, j) => (
            <span
              key={`${i}-${j}`}
              className={
                on
                  ? "aspect-square rounded-[2px] bg-foreground"
                  : "aspect-square rounded-[2px] bg-transparent"
              }
            />
          )),
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="font-display text-2xl font-semibold tracking-tight">
          $4.50
        </span>
        <span className="font-mono text-xs text-muted-foreground">Payment</span>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        <span className="size-1.5 rounded-full bg-mint" aria-hidden />
        <span className="text-sm font-medium">Confirmed</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          #A82F
        </span>
      </div>
    </div>
  );
}

// Purely decorative — a plausible-looking QR silhouette, not a real payload.
const QR_PATTERN = [
  [1, 1, 1, 0, 1, 1],
  [1, 0, 1, 1, 0, 1],
  [1, 1, 0, 1, 1, 0],
  [0, 1, 1, 0, 1, 1],
  [1, 0, 1, 1, 0, 1],
  [1, 1, 0, 1, 1, 1],
];
