import { defineConfig } from "vitest/config";

// The client against the live API, or the ohmagif at OHMAGIF_BASE_URL: what
// the unit suite's answers cannot show, that the real ones still have the
// shape this package reads.
export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/**/*.test.ts"],
    // Real requests over a shared runner's network.
    testTimeout: 30_000,
  },
});
