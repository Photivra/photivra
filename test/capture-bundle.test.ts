// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rolldown } from "rolldown";
import { scaledTimeout as testTimeout } from "./helpers/test-timeout.js";

/**
 * Bundles a consumer that imports only the named root exports (rolldown, the bundler Vite uses, minified, tree-shaken) and
 * returns the bundled modules (paths relative to src/) with their rendered exports.
 */
async function bundle(names: string[]): Promise<Map<string, readonly string[]>> {
  const dir = mkdtempSync(join(tmpdir(), "photivra-bundle-"));
  try {
    const entry = join(dir, "entry.mjs");
    writeFileSync(entry, `import { ${names.join(", ")} } from ${JSON.stringify(resolve("src/index.ts"))};\nglobalThis.keep = [${names.join(", ")}];\n`);
    const build = await rolldown({ input: entry, logLevel: "silent", resolve: { extensionAlias: { ".js": [".ts", ".js"] } } });
    const { output } = await build.generate({ format: "esm", minify: true });
    await build.close();
    const modules = new Map<string, readonly string[]>();
    for (const chunk of output) if (chunk.type === "chunk") for (const [id, m] of Object.entries(chunk.modules)) modules.set(id.replace(/\\/g, "/").replace(/^.*\/src\//, ""), m.renderedExports);
    return modules;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The display view (2.6) and the portable functions it uses must not reach bundles that only capture (issue #380).
describe("capture-only bundles", () => {
  it("leave out the display view and the portable functions", async () => {
    const modules = await bundle(["simulateCapture", "simulateIdealReference"]);
    expect(modules.has("facade/simulate-capture.ts")).toBe(true);
    expect(modules.has("facade/display-view.ts")).toBe(false);
    expect(modules.has("facade/simulate-display-view.ts")).toBe(false);
    // Captures use only these portable-math exports: the two of 2.5.0 and V8's three-argument hypot sequence of the
    // capture's query arithmetic (#452).
    expect([...(modules.get("core/portable-math.ts") ?? [])].sort()).toEqual(["equalWithinUlps", "hypot3", "portableHypot"]);
  }, testTimeout(60_000));

  it("keep them when the display view is imported", async () => {
    const modules = await bundle(["simulateDisplayView"]);
    expect(modules.has("facade/display-view.ts")).toBe(true);
    expect(modules.has("facade/simulate-display-view.ts")).toBe(true);
    expect(modules.get("core/portable-math.ts")).toEqual(expect.arrayContaining(["portablePow", "portableLog", "portableExp", "portableCbrt"]));
  }, testTimeout(60_000));
});
