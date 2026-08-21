import next from "eslint-config-next";
import sonarjs from "eslint-plugin-sonarjs";

const eslintConfig = [
  ...next,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "supabase/**",
      "coverage/**",
      ".stryker-tmp/**",
      "reports/**",
      // Nested git worktrees (.claude/worktrees/<name>/) are separate
      // checkouts with their own node_modules/.next/etc — the globs above
      // are root-anchored (gitignore semantics) and don't reach into them.
      "**/.claude/worktrees/**",
      // Harness re-sync merge-base snapshot: a byte-for-byte mirror of the
      // seeded hook scripts. Linting it too would double every finding and
      // risks eslint --fix rewriting it out of sync with harness.json's
      // recorded hash — same reasoning as the pre-commit format-lint
      // exclusion in .husky/lib/pre-commit.sh.
      ".claude/.harness-base/**",
    ],
  },
  sonarjs.configs.recommended,
  {
    rules: {
      "no-inline-comments": [
        "error",
        {
          ignorePattern:
            "eslint-|@ts-|prettier-|c8 |istanbul |webpackChunkName",
        },
      ],
      // sonarjs.configs.recommended ships this rule off by default; this
      // repo wants it enforced.
      "sonarjs/no-commented-code": "error",
    },
  },
  {
    // Generated shadcn primitives — not this repo's code to restructure.
    files: ["src/components/ui/**"],
    rules: { "sonarjs/prefer-read-only-props": "off" },
  },
  {
    files: ["**/*.test.{ts,tsx}", "**/test/**", "scripts/**"],
    rules: {
      "no-inline-comments": "off",
      // Test fixtures use fake secrets/plain-http URLs on purpose.
      "sonarjs/no-hardcoded-secrets": "off",
      "sonarjs/no-hardcoded-passwords": "off",
      "sonarjs/no-clear-text-protocols": "off",
      // Mock builders for Supabase's chainable query API (.select().eq()...)
      // are nested arrow functions by construction, not tangled logic.
      "sonarjs/no-nested-functions": "off",
    },
  },
];

export default eslintConfig;
