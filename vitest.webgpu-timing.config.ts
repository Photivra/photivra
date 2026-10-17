// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";

/** 6–24 MP WebGPU stage timings (`npm run bench:webgpu`); not part of `npm test`. See docs/WEBGPU.md. */
export default defineConfig({
  test: {
    include: ["test/webgpu/**/*.timing.ts"],
    testTimeout: 7_200_000,
    hookTimeout: 120_000,
    fileParallelism: false
  }
});
