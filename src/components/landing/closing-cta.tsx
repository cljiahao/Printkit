import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The family's shared "full-bleed dark band" closing section (see
 *  `globals.css`'s `--ink`/`--ink-foreground` tokens) — a standalone section
 *  between `Faq` and `Footer`, not a band inside `footer.tsx` itself (which
 *  deliberately stays CTA-free to match qkit's reference footer). Button
 *  colors are inverted explicitly (`bg-ink-foreground text-ink`) rather than
 *  the default `Button` variant, since `--ink`'s light/dark swap doesn't
 *  track `--primary`'s the same way — this keeps the button legible against
 *  the always-dark ink band in both site themes. */
export function ClosingCta({ authed = false }: { authed?: boolean }) {
  return (
    <section className="bg-ink text-ink-foreground">
      <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-20">
        <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          One payment setup. Every kit can use it.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-foreground/70">
          Free to start, no card required — set up PayNow or your own payment
          link once, and it&apos;s ready for every kit you run.
        </p>
        <div className="mt-8 flex justify-center">
          <Button
            asChild
            size="lg"
            className="bg-ink-foreground text-ink hover:bg-ink-foreground/90"
          >
            <Link href={authed ? "/dashboard" : "/login?mode=signup"}>
              {authed ? "Go to dashboard" : "Get started"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
