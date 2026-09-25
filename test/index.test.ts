import { describe, expect, it } from "vitest";

import { ENGINE_API_VERSION } from "../src/index.js";

describe("engine foundation", () => {
  it("exposes an explicit API version", () => {
    expect(ENGINE_API_VERSION).toBe("0.19.0");
  });
});
