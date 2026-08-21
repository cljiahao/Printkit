import type { ReactElement } from "react";

// "Banknote Engrave" marks, approximated from the OKLCH theme tokens as
// concrete hex — ImageResponse needs literal CSS colors. Uses the dark
// theme's brighter primary (not the light theme's deep teal) so the
// dark-ink text on top stays legible at icon scale.
export const BRAND_MINT = "#3E9C82";
export const BRAND_INK = "#1A1D1B";

/**
 * The printkit "P" app mark for ImageResponse-generated icons (favicon,
 * apple-touch). printkit's display font is Fraunces (shared family face, see
 * docs/business/2026-08-13-typography-family-standard.md), a serif, so this
 * uses the same Georgia stand-in as the rest of the family.
 */
export function brandIcon(size: number): ReactElement {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_MINT,
        color: BRAND_INK,
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontWeight: 700,
        fontSize: size * 0.62,
        lineHeight: 1,
        borderRadius: size * 0.22,
      }}
    >
      P
    </div>
  );
}
