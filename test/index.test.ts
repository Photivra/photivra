import { describe, expect, it } from "vitest";

import {
  ENGINE_API_VERSION,
  POC_SIMULATION_API_VERSION
} from "../src/index.js";

describe("engine foundation", () => {
  it("exposes independent root-engine and composed-POC API versions", () => {
    expect(ENGINE_API_VERSION).toBe("0.29.0");
    expect(POC_SIMULATION_API_VERSION).toBe("0.20.0");
  });
});
