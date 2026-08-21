import { describe, expect, it } from "vitest";
import { brandIcon, BRAND_MINT, BRAND_INK } from "@/lib/brand-icon";

type BrandIconProps = {
  children: string;
  style: {
    width: number;
    height: number;
    background: string;
    color: string;
    fontFamily: string;
    fontSize: number;
    borderRadius: number;
  };
};

function props(size: number): BrandIconProps {
  return brandIcon(size).props as BrandIconProps;
}

describe("brandIcon", () => {
  it("renders the 'P' letter on a mint background with an ink foreground", () => {
    const p = props(32);
    expect(p.children).toBe("P");
    expect(p.style.background).toBe(BRAND_MINT);
    expect(p.style.color).toBe(BRAND_INK);
    expect(p.style.fontFamily).toBe("Georgia, 'Times New Roman', serif");
  });

  it("scales fontSize and borderRadius proportionally to the requested size", () => {
    const small = props(32);
    const large = props(180);
    expect(small.style.width).toBe(32);
    expect(small.style.height).toBe(32);
    expect(small.style.fontSize).toBeCloseTo(32 * 0.62);
    expect(small.style.borderRadius).toBeCloseTo(32 * 0.22);
    expect(large.style.fontSize).toBeCloseTo(180 * 0.62);
    expect(large.style.borderRadius).toBeCloseTo(180 * 0.22);
  });
});
