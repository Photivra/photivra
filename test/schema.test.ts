import { describe, expect, it } from "vitest";

import type { SceneCapability } from "../src/index.js";

describe("open scene schema", () => {
  it("represents multi-resolution scene packages used by renderer clients", () => {
    const capability: SceneCapability = "multi-resolution-layers";

    expect(capability).toBe("multi-resolution-layers");
  });
});
