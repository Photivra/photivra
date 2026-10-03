// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { calculatePrintRegionDetail, parsePrintRegionDetailInput, MAX_PRINT_DETAIL_REGION_SAMPLES,
  type PrintRegionDetailInput, type CaptureOrientation } from "../src/index.js";

function input(width = 8, height = 8): PrintRegionDetailInput {
  return {
    assessmentId: "assessment-1",
    print: {
      source: { kind: "native-retained", captureId: "capture-1", geometry: { imagingArea: { widthMm: 32, heightMm: 32 }, nativeRaster: { pixelWidth: width, pixelHeight: height }, orientation: "landscape" } },
      printedImage: { width, height, unit: "inches" }, viewingDistance: { value: 24, unit: "inches" },
      sampling: { kind: "manual-ppi", pixelsPerInch: 1 }, fit: { kind: "confirmed-native-aspect", maximumRelativeAspectError: 1e-12 }
    },
    source: { captureId: "capture-1", representationId: "representation-1", contentSha256: "a".repeat(64), raster: { pixelWidth: width, pixelHeight: height }, stage: "native-retained-linear", domain: "relative-linear-luminance", registration: "oriented-retained-unwarped", processing: { id: "owned-reference", version: "0.1.0" }, noiseRealizationId: null,
      evidence: [{ sourceOrigin: "photivra", sourceReference: "owned-analytic-sinusoid-0.1.0", reuseStatus: "photivra-owned" }] },
    region: { id: "roi-1", rect: { x: 0, y: 0, width, height }, role: "selected-subject", subjectDistanceM: 2, focusDistanceM: 2 },
    target: { id: "analytic-sinusoid", version: "0.1.0", kind: "coherent-sinusoid", cyclesAcrossRegion: { x: width / 4, y: 0 }, referenceModulation: 0.5 },
    // Explicit quarter-period target; coefficient truth follows discrete orthogonality.
    samples: Array.from({ length: width * height }, (_, i) => [1.5, 1, 0.5, 1][i % 4]!)
  };
}
function sinusoid(r: PrintRegionDetailInput, kx: number, ky: number, phase = 0, mean = 1, amplitude = 0.5): void {
  const { width, height } = r.region.rect;
  r.target.cyclesAcrossRegion = { x: kx, y: ky };
  r.samples = Array.from({ length: width * height }, (_, i) => mean + amplitude * Math.cos(2 * Math.PI * (kx * (i % width) / width + ky * Math.floor(i / width) / height) + phase));
}
function circularFilter(r: PrintRegionDetailInput, axis: "x" | "y"): void {
  const { width, height } = r.region.rect, original = r.samples;
  r.samples = Array.from({ length: original.length }, (_, i) => {
    const x = i % width, y = Math.floor(i / width);
    const a = axis === "x" ? y * width + (x + width - 1) % width : ((y + height - 1) % height) * width + x;
    const b = axis === "x" ? y * width + (x + 1) % width : ((y + 1) % height) * width + x;
    return original[a]! / 4 + original[i]! / 2 + original[b]! / 4;
  });
}
const TOLERANCE = 1e-10;
describe("bounded regional Print diagnostic", () => {
  it("has independently known quarter-cycle amplitude, DC and no quality verdict", () => {
    const result = calculatePrintRegionDetail(input()), r = result.value;
    expect(result.provenance.kind).toBe("calculated"); expect(r.status).toBe("diagnostic-only");
    expect(r.measurement?.meanRelativeLuminance).toBeCloseTo(1, 12);
    expect(r.measurement?.fundamentalAmplitudeRelativeLuminance).toBeCloseTo(0.5, 12);
    expect(r.measurement?.fundamentalModulation).toBeCloseTo(0.5, 12);
    expect(r.measurement?.declaredGratingTransfer).toBeCloseTo(1, 12);
    expect(r.measurement?.unexplainedResidualRmsRelativeToMean).toBeLessThan(TOLERANCE);
    expect(r.overallPrintVerdict).toBe("not-offered"); expect(r.sourceArtifactVerification).toBe("caller-declared-unverified");
    expect(r.unassessed).toEqual(expect.arrayContaining(["captured-system-mtf", "noise", "aliasing", "halos", "compression", "color", "perceived-quality"]));
    expect(r.assurance.scientificStatus).toBe("unknown"); expect(r.assessedRasterMatchesRecommendation).toBe(true);
  });
  it.each([0, 0.41, 1.2, 2.9])("phase %s leaves amplitude unchanged", phase => {
    const r = input(16, 16); sinusoid(r, 3, -2, phase);
    expect(Math.abs(calculatePrintRegionDetail(r).value.measurement!.fundamentalModulation - 0.5)).toBeLessThan(TOLERANCE);
  });
  it.each([1e-200, 1, 1e200])("preserves modulation under scalar gain %s", gain => {
    const r = input(); r.samples = r.samples.map(v => v * gain);
    const m = calculatePrintRegionDetail(r).value.measurement!;
    expect(Math.abs(m.fundamentalModulation - 0.5)).toBeLessThan(TOLERANCE);
    expect(m.meanRelativeLuminance / gain).toBeCloseTo(1, 12);
  });
  it("retains above-one transfer and signed samples without claiming uplift", () => {
    const r = input(); sinusoid(r, 2, 0, 0, 1, 1.5);
    const result = calculatePrintRegionDetail(r).value;
    expect(result.measurement?.declaredGratingTransfer).toBeCloseTo(3, 12);
    expect(result.input.samples).toContain(-0.5); expect(result.unassessed).toContain("halos");
  });
  it.each(["x", "y"] as const)("owned isotropic convolution gives equal axial response in %s", axis => {
    const r = input(); sinusoid(r, axis === "x" ? 2 : 0, axis === "y" ? 2 : 0);
    circularFilter(r, "x"); circularFilter(r, "y");
    // Kernel response at one-quarter cycle/sample is (1 + cos(pi/2))/2 = 1/2.
    expect(calculatePrintRegionDetail(r).value.measurement?.declaredGratingTransfer).toBeCloseTo(0.5, 12);
  });
  it("directional filtering and equal PPI give different regional detail", () => {
    const x = input(), y = input(); sinusoid(x, 2, 0); sinusoid(y, 0, 2);
    circularFilter(x, "x"); circularFilter(y, "x");
    const a = calculatePrintRegionDetail(x).value, b = calculatePrintRegionDetail(y).value;
    expect(a.print.native?.pixelsPerInch).toEqual(b.print.native?.pixelsPerInch);
    expect(a.measurement?.declaredGratingTransfer).toBeCloseTo(0.5, 12);
    expect(b.measurement?.declaredGratingTransfer).toBeCloseTo(1, 12);
  });
  it("orthogonal residual energy is not certified as noise or an artifact", () => {
    const r = input(16, 8); sinusoid(r, 2, 0);
    r.samples = r.samples.map((v, i) => v + 0.1 * Math.cos(2 * Math.PI * 5 * (i % 16) / 16));
    r.source.noiseRealizationId = "declared-realization-1";
    const result = calculatePrintRegionDetail(r).value;
    expect(result.measurement?.fundamentalModulation).toBeCloseTo(0.5, 12);
    // Independent orthogonality: mean square of a non-DC cosine is 1/2.
    expect(result.measurement?.unexplainedResidualRmsRelativeToMean).toBeCloseTo(0.1 / Math.sqrt(2), 12);
    expect(result.unassessed).toContain("noise");
  });
  it("subject and deliberate-defocus region choices are independent", () => {
    const subject = input(), background = input(); background.assessmentId = "assessment-background";
    background.region.id = "background"; background.region.role = "intentional-defocus"; background.region.subjectDistanceM = 10;
    circularFilter(background, "x");
    expect(calculatePrintRegionDetail(subject).value.measurement?.declaredGratingTransfer).toBeCloseTo(1, 12);
    expect(calculatePrintRegionDetail(background).value.measurement?.declaredGratingTransfer).toBeCloseTo(0.5, 12);
    expect(calculatePrintRegionDetail(background).value.overallPrintVerdict).toBe("not-offered");
  });
  it("registers a selected subregion rather than treating its samples as the full frame", () => {
    const r = input(); if (r.print.source.kind !== "native-retained") throw Error("fixture");
    r.print.source.geometry.nativeRaster = { pixelWidth: 16, pixelHeight: 16 };
    r.source.raster = { pixelWidth: 16, pixelHeight: 16 };
    r.print.printedImage = { width: 16, height: 16, unit: "inches" };
    r.region.rect.x = 4; r.region.rect.y = 2;
    const result = calculatePrintRegionDetail(r).value;
    expect(result.projection?.fieldPointMm).toEqual({ x: 0, y: 4 });
    expect(result.projection?.physicalPeriodMm).toBeCloseTo(101.6, 12);
    expect(result.measurement?.declaredGratingTransfer).toBeCloseTo(1, 12);
  });
  it("physical enlargement/viewing projection never changes measured capture coefficients", () => {
    const r = input(), before = calculatePrintRegionDetail(r).value;
    r.assessmentId = "assessment-enlarged"; r.print.printedImage.width *= 2; r.print.printedImage.height *= 2;
    const after = calculatePrintRegionDetail(r).value;
    expect(after.measurement).toEqual(before.measurement);
    expect(before.projection?.physicalPeriodMm).toBeCloseTo(101.6, 12);
    expect(after.projection?.physicalPeriodMm).toBeCloseTo(203.2, 12);
    // For a 4-inch period at 24 inches the half-angle tangent is 1/12.
    expect(before.projection?.angularPeriodAtImageCenterDegrees).toBeCloseTo(9.527283381452355, 10);
    r.print.viewingDistance.value *= 2;
    expect(calculatePrintRegionDetail(r).value.projection?.angularPeriodAtImageCenterDegrees).toBe(before.projection?.angularPeriodAtImageCenterDegrees);
    expect(after.print.nativePixelSufficiency).toBe("insufficient");
  });
  it.each(["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as CaptureOrientation[])("maps off-center crop in %s through existing geometry", orientation => {
    const r = input(4, 4);
    if (r.print.source.kind !== "native-retained") throw Error("fixture");
    // Native full field 32mm over16px: native pixel center coordinate maps at 2mm/px.
    r.print.source.geometry = { imagingArea: { widthMm: 32, heightMm: 32 }, nativeRaster: { pixelWidth: 16, pixelHeight: 16 }, activeCaptureRect: { x: 4, y: 2, width: 8, height: 12 }, orientation, outputCropRect: { x: 1, y: 3, width: 4, height: 4 } };
    const result = calculatePrintRegionDetail(r).value;
    // Inverse oriented crop-center (3,5) in active 8x12: (3,5),(5,9),(5,7),(3,3).
    const expected = { landscape: { x: -2, y: 2 }, "portrait-clockwise": { x: 2, y: -6 }, "landscape-inverted": { x: 2, y: -2 }, "portrait-counter-clockwise": { x: -2, y: 6 } };
    expect(result.projection?.fieldPointMm).toEqual(expected[orientation]);
    expect(result.measurement?.fundamentalModulation).toBeCloseTo(0.5, 12);
  });
  it("binds post-resampling and decoded stages to actual raster/artifact identity", () => {
    for (const stage of ["post-resampling-linear", "post-encoding-decoded-linear"] as const) {
      const r = input(); if (r.print.source.kind !== "native-retained") throw Error("fixture");
      r.print.source.geometry.nativeRaster = { pixelWidth: 16, pixelHeight: 16 }; r.source.stage = stage;
      r.source.representationId = stage; r.source.processing = { id: "declared-decoder", version: "0.1.0" };
      const result = calculatePrintRegionDetail(r).value;
      expect(result.status).toBe("diagnostic-only"); expect(result.input.source.raster).toEqual({ pixelWidth: 8, pixelHeight: 8 });
      expect(result.unassessed).toContain("compression"); expect(result.sourceArtifactVerification).toBe("caller-declared-unverified");
    }
  });
  it("copies input ownership and freezes full result without freezing caller data", () => {
    const r = input(), parsed = parsePrintRegionDetailInput(r), result = calculatePrintRegionDetail(r).value;
    expect(Object.isFrozen(result.input.samples)).toBe(true); expect(Object.isFrozen(result.input.print.source)).toBe(true);
    expect(Object.isFrozen(r.samples)).toBe(false);
    (r.samples as number[])[0] = 99; r.source.processing.id = "changed";
    expect(parsed.samples[0]).toBe(1.5); expect(result.input.source.processing.id).toBe("owned-reference");
  });
  it("fixed-seed independent convolution factors validate multiple coherent directions", () => {
    let seed = 196;
    for (let i = 0; i < 40; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const kx = 1 + seed % 7, ky = (seed >>> 3) % 5, r = input(16, 16);
      sinusoid(r, kx, ky, seed / 2 ** 32); circularFilter(r, "x");
      const expected = (1 + Math.cos(2 * Math.PI * kx / 16)) / 2;
      expect(Math.abs(calculatePrintRegionDetail(r).value.measurement!.declaredGratingTransfer - expected)).toBeLessThan(TOLERANCE);
    }
  });
  it("exercises the exact documented work cap, not a device-performance claim", () => {
    const r = input(256, 256);
    expect(r.samples.length).toBe(MAX_PRINT_DETAIL_REGION_SAMPLES);
    expect(calculatePrintRegionDetail(r).value.measurement?.declaredGratingTransfer).toBeCloseTo(1, 10);
    const large = input(512, 256);
    expect(() => parsePrintRegionDetailInput(large)).toThrow(/bounded/);
  });
});

describe("Print detail applicability and parser boundaries", () => {
  it.each([
    ["capture-identity", "blocked", "capture-identity-mismatch"], ["native-mismatch", "blocked", "native-representation-raster-mismatch"],
    ["upscale", "blocked", "represented-native-upscale-unsupported"], ["aspect", "blocked", "represented-retained-aspect-mismatch"],
    ["encoded", "unsupported", "linear-luminance-domain-required"], ["warp", "unsupported", "correction-warp-registration-unqualified"],
    ["dc", "unsupported", "dc-nyquist-or-aliased-frequency-unsupported"], ["nyquist", "unsupported", "dc-nyquist-or-aliased-frequency-unsupported"],
    ["missing-native", "blocked", "missing-authoritative-native-geometry"], ["wrong-print-aspect", "blocked", "print-crop-confirmation-required"],
    ["extreme-print", "unsupported", "print-geometry-unsupported"]
  ] as const)("reports %s explicitly", (kind, status, reason) => {
    const r = input();
    if (kind === "capture-identity") r.source.captureId = "different";
    if (kind === "native-mismatch" && r.print.source.kind === "native-retained") r.print.source.geometry.nativeRaster = { pixelWidth: 16, pixelHeight: 16 };
    if (kind === "upscale" && r.print.source.kind === "native-retained") { r.source.stage = "post-resampling-linear"; r.print.source.geometry.nativeRaster = { pixelWidth: 4, pixelHeight: 4 }; }
    if (kind === "aspect" && r.print.source.kind === "native-retained") { r.source.stage = "post-resampling-linear"; r.print.source.geometry.nativeRaster = { pixelWidth: 16, pixelHeight: 8 }; r.print.printedImage.width = 16; }
    if (kind === "encoded") r.source.domain = "transfer-encoded-luma";
    if (kind === "warp") r.source.registration = "correction-or-warp-unqualified";
    if (kind === "dc") r.target.cyclesAcrossRegion.x = 0;
    if (kind === "nyquist") r.target.cyclesAcrossRegion.x = 4;
    if (kind === "missing-native") r.print.source = { kind: "unavailable", reason: "missing-native-raster" };
    if (kind === "wrong-print-aspect") r.print.printedImage.width = 7;
    if (kind === "extreme-print") r.print.printedImage = { width: Number.MAX_VALUE, height: Number.MAX_VALUE, unit: "inches" };
    const result = calculatePrintRegionDetail(r).value;
    expect(result.status).toBe(status); expect(result.blockers).toContain(reason); expect(result.measurement).toBeNull();
  });
  it.each([0, -1])("unsupported mean %s produces no coefficients", value => {
    const r = input(); r.samples = r.samples.map(() => value);
    expect(calculatePrintRegionDetail(r).value.blockers).toContain("nonpositive-region-mean");
  });
  it("finite sample restoration overflow is unsupported instead of JSON infinity", () => {
    const r = input(); r.samples = r.samples.map((_, i) => [Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE][i % 4]!);
    r.target.referenceModulation = Number.MIN_VALUE;
    const result = calculatePrintRegionDetail(r).value;
    expect(result.status).toBe("unsupported"); expect(JSON.stringify(result)).not.toMatch(/Infinity|NaN/);
  });
  it("rejects nonzero sample loss during normalization instead of calling it zero", () => {
    const r = input(); r.samples = r.samples.map((_, i) => i === 0 ? Number.MIN_VALUE : Number.MAX_VALUE);
    const result = calculatePrintRegionDetail(r).value;
    expect(result.status).toBe("unsupported"); expect(result.blockers).toContain("measurement-dynamic-range-unsupported");
  });
  it.each([null, [], {}, { ...input(), privatePath: "/secret" }, { ...input(), samples: [] }, { ...input(), assessmentId: "https://internal/id" }])("rejects invalid root/input", value => {
    expect(() => parsePrintRegionDetailInput(value)).toThrow();
  });
  it("rejects sparse/nonfinite data, unknown enums, metadata, rights and invalid rectangles", () => {
    const mutations: ((r: PrintRegionDetailInput) => void)[] = [
      (r: PrintRegionDetailInput): void => { const samples = [...r.samples]; delete samples[2]; r.samples = samples; },
      (r: PrintRegionDetailInput): void => { r.samples = r.samples.map((v, i) => i ? v : NaN); },
      (r: PrintRegionDetailInput): void => { Object.assign(r.source, { private: true }); },
      (r: PrintRegionDetailInput): void => { Object.assign(r.source, { stage: "preview" }); },
      (r: PrintRegionDetailInput): void => { Object.assign(r.source.processing, { path: "/secret" }); },
      (r: PrintRegionDetailInput): void => { r.source.contentSha256 = "invalid"; },
      (r: PrintRegionDetailInput): void => { r.source.evidence = []; },
      (r: PrintRegionDetailInput): void => { r.source.evidence = [{ sourceOrigin: "third-party", sourceReference: "paper", reuseStatus: "factual-reference-only" }]; },
      (r: PrintRegionDetailInput): void => { r.source.evidence = [{ sourceOrigin: "third-party", sourceReference: "licensed-data", reuseStatus: "reusable-data" }]; },
      (r: PrintRegionDetailInput): void => { r.region.rect.x = 1; }, (r: PrintRegionDetailInput): void => { r.region.rect.width = 0; }, (r: PrintRegionDetailInput): void => { r.region.rect.y = 0.5; },
      (r: PrintRegionDetailInput): void => { r.region.focusDistanceM = -1; }, (r: PrintRegionDetailInput): void => { r.target.referenceModulation = 2; }, (r: PrintRegionDetailInput): void => { r.target.cyclesAcrossRegion.x = 0.5; }
    ];
    for (const mutate of mutations) { const r = input(); mutate(r); expect(() => parsePrintRegionDetailInput(r)).toThrow(); }
  });
  it("preserves reusable-data declarations without treating them as verified acquisition", () => {
    const r = input(); r.source.evidence = [{ sourceOrigin: "third-party", sourceReference: "public-owned-reference", reuseStatus: "reusable-data", license: "CC0-1.0" }];
    expect(calculatePrintRegionDetail(r).value.assurance.scientificStatus).toBe("unknown");
  });
});
