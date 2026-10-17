import { defineConfig } from "vitest/config";

/** Real-GPU conformance suite (`npm run test:webgpu`); not part of `npm test`. See docs/WEBGPU.md. */
export default defineConfig({
  test: {
    include: ["test/webgpu/**/*.webgpu.ts"],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    fileParallelism: false
  }
});
