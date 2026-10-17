// SPDX-License-Identifier: Apache-2.0
/** Hardware-conformance wiring of `npm run test:webgpu` and `bench:webgpu` (#277): flag selection and the software-adapter policy. */
import { describe, expect, it } from "vitest";
import { adapterSkipReason, hardwareWebGpuFlags, isSoftwareAdapter, SWIFTSHADER_WEBGPU_FLAGS, webGpuFlags } from "./webgpu/chromium.js";

describe("WebGPU suite wiring", () => {
  it("chooses SwiftShader by default, hardware flags on request, and explicit flags over both", () => {
    expect(webGpuFlags({})).toEqual(SWIFTSHADER_WEBGPU_FLAGS);
    expect(webGpuFlags({ PHOTIVRA_WEBGPU_ADAPTER: "hardware" })).toEqual(hardwareWebGpuFlags());
    expect(webGpuFlags({ PHOTIVRA_WEBGPU_ADAPTER: "hardware", PHOTIVRA_WEBGPU_FLAGS: " --a  --b " })).toEqual(["--a", "--b"]);
    expect(hardwareWebGpuFlags("linux")).toContain("--enable-features=Vulkan");
    expect(hardwareWebGpuFlags("darwin")).not.toContain("--use-webgpu-adapter=swiftshader");
  });
  it("never lets a hardware run pass on a software adapter", () => {
    const swiftshader = { available: true, adapter: { vendor: "google", architecture: "swiftshader", isFallbackAdapter: true } };
    const hardware = { available: true, adapter: { vendor: "example-vendor", architecture: "example-architecture", isFallbackAdapter: false } };
    expect(isSoftwareAdapter(swiftshader)).toBe(true);
    expect(isSoftwareAdapter(hardware)).toBe(false);
    expect(adapterSkipReason(swiftshader, {})).toBeNull();
    expect(adapterSkipReason(swiftshader, { PHOTIVRA_WEBGPU_REQUIRE_HARDWARE: "1" })).toMatch(/software adapter/u);
    expect(adapterSkipReason(hardware, { PHOTIVRA_WEBGPU_REQUIRE_HARDWARE: "1" })).toBeNull();
    expect(adapterSkipReason({ available: false }, {})).toMatch(/no WebGPU adapter/u);
  });
});
