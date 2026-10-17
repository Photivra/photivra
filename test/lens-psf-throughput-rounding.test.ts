// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { resolveLensSampledPsf, type LensSampledPsfProfile } from "../src/index.js";

const evidence = [{ sourceOrigin: "photivra" as const, sourceReference: "test:psf-throughput-rounding", reuseStatus: "photivra-owned" as const }];
/** A 2 × 2 × 2 field/wavelength grid whose every node declares the same relative pupil throughput. */
function profile(throughput: number | ((i: number) => number)): LensSampledPsfProfile {
  const axes = { focalLengthMm: [50], focusDiopters: [0.2], apertureFNumber: [8], fieldXmm: [-1, 1], fieldYmm: [-1, 1], wavelengthNm: [380, 780], signedDefocusImagePlaneMicrometers: [0] };
  const kernel = { widthSamples: 1, heightSamples: 1, samplePitchMicrometersX: 1, samplePitchMicrometersY: 1, centerSampleX: 0, centerSampleY: 0, normalizedIntensity: [1] };
  let i = 0;
  return { schemaVersion: "0.1.0", profileId: "rounding", profileVersion: "1", scientificStatus: "approximation", opticalDomain: "lens-primary-optical-path-only",
    coordinateSystem: "image-plane-metric", fieldAxes: "+X right, +Y up", kernelEnergyNormalization: "unit-energy-shape", interpolation: "bounded-regular-grid-multilinear",
    throughputOwnership: "separate-relative-pupil-throughput-factor", responseIncludes: { diffraction: true, aberration: true, defocus: true, pupilClippingShape: true },
    sensorOpticalStackIncluded: false, sensorSamplingIncluded: false, reconstructionIncluded: false, strayLightIncluded: false, axes, evidence, limitations: ["Synthetic."],
    nodes: axes.fieldXmm.flatMap((x) => axes.fieldYmm.flatMap((y) => axes.wavelengthNm.map((nm) => ({ nodeId: "n" + x + y + nm,
      coordinate: { focalLengthMm: 50, focusDiopters: 0.2, apertureFNumber: 8, fieldXmm: x, fieldYmm: y, wavelengthNm: nm, signedDefocusImagePlaneMicrometers: 0 },
      kernel, bestFocusImagePlaneOffsetMicrometers: 0, relativePupilThroughputFactor: typeof throughput === "number" ? throughput : throughput(i++), evidence,
      uncertainty: { kind: "not-quantified" as const, limitation: "Synthetic." } })))) };
}
const resolve = (p: LensSampledPsfProfile, x: number, y: number, nm: number): number => resolveLensSampledPsf({ profile: p, focalLengthMm: 50,
  focus: { kind: "finite", distanceM: 5 }, apertureFNumber: 8, fieldPointMm: { x, y }, wavelengthNm: nm, signedDefocusImagePlaneMicrometers: 0 }).value.relativePupilThroughputFactor;

describe("sampled PSF throughput interpolation rounding", () => {
  it("accepts a uniform throughput of exactly 1 everywhere, though multilinear weights round slightly above 1", () => {
    const p = profile(1);
    let points = 0;
    for (let ix = 0; ix <= 12; ix++) for (let iy = 0; iy <= 12; iy++) for (const nm of [380, 437.3, 555, 650.1, 780]) {
      const value = resolve(p, -1 + ix / 6, -1 + iy / 6.5, nm);
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBeCloseTo(1, 14);
      points++;
    }
    expect(points).toBe(13 * 13 * 5);
  });

  it("keeps interior values unchanged and refuses node throughput above 1", () => {
    const mixed = profile((i) => (i % 2 === 0 ? 0.5 : 0.9));
    expect(resolve(mixed, 0, 0, 580)).toBeCloseTo(0.7, 12);
    // Node throughput above 1 is refused when the profile is parsed, so only rounding can lift an interpolated value above 1.
    expect(() => resolve(profile(1.0000001), 0.3, 0.1, 500)).toThrow();
  });
});
