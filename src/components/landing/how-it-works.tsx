import { KeyRound, QrCode, CheckCheck } from "lucide-react";

const STEPS = [
  {
    icon: KeyRound,
    title: "Connect your payment method",
    body: "PayNow (UEN or mobile), or your own payment link/QR. Set it up once — reused by every kit you run.",
  },
  {
    icon: QrCode,
    title: "A kit requests a checkout",
    body: "qkit (and later kits) asks paykit for a checkout — paykit builds it, the customer scans or taps to pay.",
  },
  {
    icon: CheckCheck,
    title: "You confirm, it's done",
    body: 'Customer taps "I\'ve paid," you confirm receipt from your dashboard. paykit tracks the status — it never holds the money.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          How it works
        </p>
        <h2 className="mt-3 max-w-xl text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Infrastructure, not another dashboard to babysit.
        </h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-mint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="h-px flex-1 bg-border" />
                <s.icon className="size-5 text-mint" aria-hidden />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
