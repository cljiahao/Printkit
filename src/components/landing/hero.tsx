import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckoutCard } from "./checkout-card";

const STATS = [
  { value: "0", label: "cap on free transactions" },
  { value: "$0", label: "to start" },
  { value: "1", label: "payment setup, every kit" },
];

export function Hero({ authed = false }: { authed?: boolean }) {
  return (
    <section className="relative overflow-hidden">
      {/* payment-flow gradient mesh — mint blending into the cooler "flow"
          teal, standing in for money moving between kits. Quiet, not a
          full-bleed wash, so it reads as infrastructure rather than décor. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-32 h-96 opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(45% 60% at 20% 30%, var(--color-mint), transparent 70%), radial-gradient(40% 55% at 80% 20%, var(--color-flow), transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:items-center">
        <div className="fade-rise">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Payments · shared across every kit
          </p>
          <h1 className="mt-3 text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            One payment setup.
            <br />
            Every kit can use it.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            paykit generates your checkout — a PayNow QR, or your own payment
            link or QR — tracks who&apos;s paid, and never touches the money.
            Set it up once — qkit, and every kit after it, checks out through
            the same engine.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={authed ? "/dashboard" : "/login?mode=signup"}>
                {authed ? "Go to dashboard" : "Get started"}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#how">See how it works</Link>
            </Button>
          </div>

          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t pt-8">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-2xl font-semibold tracking-tight text-mint sm:text-3xl">
                  {s.value}
                </dd>
                <dd className="mt-1 text-xs leading-tight text-muted-foreground">
                  {s.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="fade-rise flex justify-center lg:justify-end">
          <CheckoutCard />
        </div>
      </div>
    </section>
  );
}
