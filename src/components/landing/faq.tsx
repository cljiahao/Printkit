type FaqEntry = { q: string; a: string };

function FaqItem({ q, a }: FaqEntry) {
  return (
    <details className="group overflow-hidden rounded-xl border border-border bg-card open:border-primary/50">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset">
        <span className="text-base font-semibold leading-snug text-foreground">
          {q}
        </span>
        <span
          aria-hidden
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border text-lg leading-none text-muted-foreground transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="px-5 pb-5 text-sm leading-relaxed text-foreground/80">
        {a}
      </div>
    </details>
  );
}

export function Faq({ monthlyPriceLabel }: { monthlyPriceLabel: string }) {
  const FAQ: FaqEntry[] = [
    {
      q: "Does paykit hold my money?",
      a: "No. paykit only renders your checkout — a PayNow QR, or your own payment link/QR — and tracks its status. Customers pay you directly — paykit never touches funds.",
    },
    {
      q: "How do I know a payment came through?",
      a: "A customer marks an order as paid after scanning; you confirm it yourself once you see it land in your bank account. There's no automatic bank-side verification.",
    },
    {
      q: "Do I need a business bank account?",
      a: "No — use PayNow with your UEN or personal mobile number, or bring your own payment link/QR (GrabPay, HitPay, Qashier, or your bank's own) instead.",
    },
    {
      q: "What does the free plan include?",
      a: `Unlimited transactions and revenue stats on the free plan, no cap. Pro adds refund tracking, ${monthlyPriceLabel}.`,
    },
  ];

  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        FAQ
      </p>
      <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Questions
      </h2>
      <div className="mt-10 space-y-3">
        {FAQ.map((item) => (
          <FaqItem key={item.q} {...item} />
        ))}
      </div>
    </section>
  );
}
