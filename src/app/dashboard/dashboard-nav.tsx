"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardNav as SharedDashboardNav, getSwitchKits } from "@merqo/ui";
import { SUPPORT_CATEGORY_LABELS } from "@/lib/schemas";
import type { SupportMessageInput } from "@/lib/schemas";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { submitSupportMessageAction } from "@/app/actions/support";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/history", label: "History" },
];

function isActive(path: string, href: string): boolean {
  return href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
}

const HELP_CATEGORIES: {
  value: SupportMessageInput["category"];
  label: string;
}[] = Object.entries(SUPPORT_CATEGORY_LABELS).map(([value, label]) => ({
  value: value as SupportMessageInput["category"],
  label,
}));
const HELP_CATEGORY_VALUES: readonly string[] = HELP_CATEGORIES.map(
  (c) => c.value,
);
function isHelpCategory(
  value: string | undefined,
): value is SupportMessageInput["category"] {
  return value !== undefined && HELP_CATEGORY_VALUES.includes(value);
}

/**
 * Composes @merqo/ui's DashboardNav/AccountMenu — same shared-component
 * contract every sibling kit uses. No plan/tier/tour concept here, so
 * those optional props are simply omitted (see Plan 3 Global Constraints).
 */
export function DashboardNav({
  signOut,
  vendorName,
  avatarUrl = null,
}: {
  signOut: () => Promise<void>;
  vendorName: string;
  avatarUrl?: string | null;
}) {
  const path = usePathname();

  return (
    <SharedDashboardNav
      wordmark={
        <Link
          href="/dashboard"
          aria-label="printkit dashboard home"
          className="font-display shrink-0 text-3xl font-semibold tracking-tight outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          printkit
        </Link>
      }
      navLinks={LINKS}
      LinkComponent={Link}
      isActiveHref={(href) => isActive(path, href)}
      vendor={{
        name: vendorName || "Account",
        avatarUrl: avatarUrl ?? undefined,
        // `subtitle` is the only line @merqo/ui's AccountMenu renders next
        // to the trigger and in the dropdown header, so the vendor name
        // needs to go there, not just into the initials-only `name` field.
        subtitle: vendorName || "Account",
      }}
      signOutAction={signOut}
      switchKits={getSwitchKits("printkit")}
      getHelp={{
        type: "form",
        onSubmit: async ({ message, category }) => {
          const res = await submitSupportMessageAction({
            category: isHelpCategory(category) ? category : "other",
            body: message,
          });
          if (!res.success) throw new Error(res.error);
        },
        categories: HELP_CATEGORIES,
      }}
      onFeedbackSubmit={async ({ message, nps }) => {
        const res = await submitFeedbackAction({
          nps: nps ?? 0,
          message: message.trim() || undefined,
        });
        if (!res.success) throw new Error(res.error);
      }}
      feedbackSource="vendor"
      feedbackMetric="nps"
      showNps
    />
  );
}
