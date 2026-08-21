import { Link2, ShieldCheck, Gauge, History } from "lucide-react";

export function Benefits({ monthlyPriceLabel }: { monthlyPriceLabel: string }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Why paykit
      </p>
      <h2 className="mt-3 max-w-xl text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Built to be the one payment engine, not another one.
      </h2>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-6 sm:col-span-2 sm:row-span-2">
          <Link2 className="size-6 text-mint" aria-hidden />
          <h3 className="mt-4 font-display text-xl font-bold">
            One setup, every kit
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            A vendor has one payment setup, not one per kit. Connect it once in
            paykit and it&apos;s already there for qkit today, and for whatever
            kit launches next — no re-onboarding, no second config screen to
            maintain.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6">
          <ShieldCheck className="size-6 text-mint" aria-hidden />
          <h3 className="mt-4 font-display text-lg font-bold">
            Never touches the money
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Customers pay straight into your own account. paykit only renders
            the checkout and tracks status — no funds pass through it.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6">
          <History className="size-6 text-mint" aria-hidden />
          <h3 className="mt-4 font-display text-lg font-bold">
            Proven, not brand new
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The QR engine is the same one already live in qkit — extracted, not
            rewritten from scratch.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6 sm:col-span-3">
          <Gauge className="size-6 text-mint" aria-hidden />
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-bold">
                Free while you&apos;re small
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Unlimited transactions and revenue stats, no card required. Pro
                adds refund tracking — {monthlyPriceLabel}, once you&apos;re
                doing enough volume to want it.
              </p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              gated by scale, not by feature
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
