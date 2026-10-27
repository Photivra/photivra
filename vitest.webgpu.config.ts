import { defineConfig } from "vitest/config";

/** Real-GPU conformance suite (`npm run test:webgpu`); not part of `npm test`. See docs/WEBGPU.md. */
export default defineConfig({
  test: {
    include: ["test/webgpu/**/*.webgpu.ts"],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // Vitest 5's default reporter shows a passing test's console output only in verbose mode; the suite's
    // console output (the adapter and the measured maxima of every file) is its record, so print it.
    reporters: ["verbose"]
  }
});
