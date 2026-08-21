import Link from "next/link";
import { Wordmark } from "./wordmark";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row">
        <Link
          href="/"
          aria-label="paykit home"
          className="transition-opacity hover:opacity-80"
        >
          <Wordmark className="text-xl" />
        </Link>
        <span>The Merqo family&apos;s shared vendor payment engine.</span>
        <span className="text-xs">© 2026 paykit · a Merqo kit</span>
        <Link href="/login" className="hover:text-foreground">
          Vendor sign in →
        </Link>
      </div>
    </footer>
  );
}
