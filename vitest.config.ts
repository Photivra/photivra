import { configDefaults, defineConfig } from "vitest/config";

/*
 * V8 coverage instrumentation slows the heavy numerical fixtures by roughly 3-4x on a
 * 4-core host (measured: the 128-time-node visibility capture took 4.5-5.3 s alone and
 * 16-21 s under coverage). Coverage runs therefore scale every timeout by the same factor;
 * test files with an explicit timeout use test/helpers/test-timeout.ts. No assertion, test
 * workload or coverage threshold changes.
 */
const coverageRun = process.argv.some(
  (argument) => argument === "--coverage" || argument.startsWith("--coverage.") || argument.startsWith("--coverage=")
);
const timeoutScale = coverageRun ? 4 : 1;

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", ".claude/**", ...configDefaults.exclude],
    testTimeout: 5_000 * timeoutScale,
    hookTimeout: 10_000 * timeoutScale,
    env: { PHOTIVRA_TEST_TIMEOUT_SCALE: String(timeoutScale) },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/api/poc-api-cli.ts",
        "src/schema/camera.ts",
        "src/schema/scene.ts"
      ],
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 80
      }
    }
  }
});
