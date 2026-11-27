import { defineConfig, devices } from "@playwright/test";

// Runs against the example that is already up: `make example` locally, the
// build `make e2e-ci` serves in CI, or any copy of it, a pull request's
// preview included (OHMAGIF_JS_E2E_URL, ending in a slash). The example talks
// to the live API, or to the ohmagif at OHMAGIF_BASE_URL, whose files are at
// OHMAGIF_MEDIA_URL.
const baseURL = process.env.OHMAGIF_JS_E2E_URL ?? "http://localhost:8082/";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // One at a time: the API allows an address 60 requests a minute.
  workers: 1,
  retries: 0,
  reporter: [["dot"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } }],
});
