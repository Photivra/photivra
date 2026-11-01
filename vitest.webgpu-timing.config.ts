// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";
// #536: the timings measure the shader text the build ships; PHOTIVRA_WGSL_MINIFY=0 measures the source text.
import { wgslMinifyPlugin } from "./scripts/lib/wgsl-minify.mjs";

/** 6–24 MP WebGPU stage timings (`npm run bench:webgpu`); not part of `npm test`. See docs/WEBGPU.md. */
export default defineConfig({
  plugins: process.env.PHOTIVRA_WGSL_MINIFY === "0" ? [] : [wgslMinifyPlugin()],
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
