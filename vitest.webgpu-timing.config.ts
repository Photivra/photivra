// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";

/** 6–24 MP WebGPU stage timings (`npm run bench:webgpu`); not part of `npm test`. See docs/WEBGPU.md. */
export default defineConfig({
  test: {
    include: ["test/webgpu/**/*.timing.ts"],
    testTimeout: 7_200_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // Vitest 5's default reporter shows a passing test's console output only in verbose mode; the suite's
    // console output (the JSON report and the per-stage summary lines) is its record, so print it.
    reporters: ["verbose"]
  }
});
