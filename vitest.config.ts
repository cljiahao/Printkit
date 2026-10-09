import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  envDir: false,
  resolve: {
    alias: { "@": path.resolve(rootDir, "src") },
  },
  test: {
    globals: true,
    maxWorkers: 2,
    environment: "node",
    testTimeout: 10000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-anon-key",
    },
    passWithNoTests: true,
    setupFiles: ["./test/setup.ts"],
    include: [
      "test/**/*.{test,spec}.{ts,tsx}",
      "src/**/*.test.{ts,tsx}",
      "bridge-agent/src/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
      reporter: ["text", "lcov", "cobertura"],
      include: ["src/**/*.ts", "src/**/*.tsx", "bridge-agent/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
    },
  },
});
