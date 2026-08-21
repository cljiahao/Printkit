import { Globe, Instagram, Facebook, Music2 } from "lucide-react";
import type { SocialLinks } from "@/lib/types";

/**
 * Shared vendor social-link field list. Plain lucide glyphs (not brand-mark
 * icons/colors like qkit's @icons-pack/react-simple-icons) — paykit doesn't
 * carry that dependency and these are a secondary, low-emphasis field on
 * this page, not worth a new package for.
 */
export const SOCIAL_LINK_FIELDS: {
  key: keyof SocialLinks;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "website", label: "Website", icon: Globe },
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "tiktok", label: "TikTok", icon: Music2 },
];
