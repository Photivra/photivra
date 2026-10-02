// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { calculateProcessedSensorRaw, createPhotographicExportPair, parseProcessedSensorRawInput,
  type ProcessedSensorRawInput } from "../src/index.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

function input(): ProcessedSensorRawInput {
  const {reconstruction,colorProfile,whiteBalance,rendering}=loadPhotographicExportInput();
  return {reconstruction,colorProfile,whiteBalance,rendering};
}
describe("committed RAW processed preview", () => {
  it("shares deterministic high fidelity rendering with JPEG packing without a canvas or screenshot", async () => {
    const v=loadPhotographicExportInput(), p=calculateProcessedSensorRaw(input()).value;
    const pair=await createPhotographicExportPair(v);
    expect(pair.rendering).toEqual(p.rendering);
    expect(pair.processedOutputView).toEqual(p.processedOutputView);
    expect(pair.source).toEqual(p.source);
    expect(p.outputDomain).toBe("output-referred-srgb-d65-sdr");
    expect(p.rendering.value.outputEncoding.colorSpace).toBe("srgb");
    expect(p.rendering.value.outputEncoding.whitePointXy).toEqual([.3127,.329]);
    expect(p.displayAdaptationApplied).toBe(false);
    expect(calculateProcessedSensorRaw(input())).toEqual(calculateProcessedSensorRaw(input()));
  });
  it("changes rendering exposure and tone without changing RAW noise, capture clipping or physical settings", async () => {
    const v=input(), before=structuredClone(v), a=calculateProcessedSensorRaw(v).value;
    v.rendering={...v.rendering,profileId:"bright",renderingExposureEv:4};
    const b=calculateProcessedSensorRaw(v).value;
    expect(b.rendering.value.integerSamples).not.toEqual(a.rendering.value.integerSamples);
    expect(b.source).toEqual(a.source);
    expect(b.source.value.rawFrame.capture).toEqual(before.reconstruction.rawFrame.capture);
    expect(b.rendering.value.diagnostics.gamutClippedHighSampleCount).toBeGreaterThan(0);
    v.rendering={...v.rendering,profileId:"compressed",toneCurve:"positive-reinhard-per-channel"};
    const c=calculateProcessedSensorRaw(v).value;
    expect(c.rendering.value.diagnostics.gamutClippedHighSampleCount).toBe(0);
    expect(c.source.value.rawFrame.samples.filter(s=>s.digitalSaturationApplied)).toHaveLength(1);
    expect(c.physicalCaptureModified).toBe(false);
    const e=loadPhotographicExportInput(), plain=await createPhotographicExportPair(e);
    e.rendering=v.rendering;
    const changed=await createPhotographicExportPair(e);
    expect(changed.rawDataUniqueId).toBe(plain.rawDataUniqueId);
    expect(changed.metadata.shared.exposure).toEqual(plain.metadata.shared.exposure);
    expect(changed.jpeg.bytes).not.toEqual(plain.jpeg.bytes);
  });
  it("keeps output gamut rejection explicit and rejects mislabeled HDR, unknown policy and double-WB declarations", () => {
    const v=input();
    expect(()=>parseProcessedSensorRawInput({...v,whiteBalance:"already-applied"})).toThrow();
    expect(()=>parseProcessedSensorRawInput({...v,rendering:{...v.rendering,outputDynamicRange:"hdr",transferFunction:"pq"}})).toThrow();
    expect(()=>parseProcessedSensorRawInput({...v,canvas:{}})).toThrow();
    expect(()=>calculateProcessedSensorRaw({...v,rendering:{...v.rendering,renderingExposureEv:8,gamutHandling:"reject-out-of-range"}})).toThrow();
  });
  it("supports explicit 16-bit preview while the baseline JPEG encoder rejects that bit depth", async () => {
    const v=input();v.rendering={...v.rendering,bitDepth:16};
    expect(calculateProcessedSensorRaw(v).value.rendering.value.outputEncoding.codeMaximum).toBe(65535);
    const e=loadPhotographicExportInput();e.rendering=v.rendering;
    await expect(createPhotographicExportPair(e)).rejects.toThrow("8-bit");
  });
  it("owns parsed policy and source arrays independently of later caller mutation", () => {
    const v=input(), parsed=parseProcessedSensorRawInput(v), result=calculateProcessedSensorRaw(v), before=structuredClone(result);
    v.colorProfile={...v.colorProfile,normalizedCameraChannelsToXyz:[[999,0,0],[0,1,0],[0,0,1]]};
    v.rendering.renderingExposureEv=10;
    expect(parsed.colorProfile.normalizedCameraChannelsToXyz[0]![0]).not.toBe(999);
    expect(result).toEqual(before);
  });
});
