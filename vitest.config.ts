import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // text for the log, json-summary for the run page, lcov for Coveralls.
      reporter: ["text", "json-summary", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.*", "src/test/**"],
      // Every statement, branch, function and line: what no test reaches is
      // either tested or taken out.
      thresholds: { 100: true },
    },
  },
});
