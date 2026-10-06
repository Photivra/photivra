import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ENGINE_API_VERSION,
  POC_SIMULATION_API_VERSION
} from "../src/index.js";

describe("engine foundation", () => {
  it("aligns the root-engine release with the package while preserving the POC contract", () => {
    expect(ENGINE_API_VERSION).toBe("1.5.0");
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(ENGINE_API_VERSION).toBe(manifest.version);
    expect(POC_SIMULATION_API_VERSION).toBe("0.20.0");
  });
});
