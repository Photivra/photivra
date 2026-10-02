// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createSimulatedCapture, simulateSensorRawFrame, createPhotographicExportPair,
  parseSensorRawProducerInput,
  type CaptureOrientation, type SensorRawProducerInput, type PhotographicExportInput } from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { correctionProfile, state } from "./optics-group-fixtures.js";

const base = loadBasicReferenceFixture();
const width = 6, height = 4;
const orientations = ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const;

/** #130 optical/exposure state, with an explicitly tiny square-pitch Bayer regression lattice.
 * Expectations are declared test inputs, not scene radiance or calibrated spectral sensor response. */
function producer(orientation: CaptureOrientation = "landscape", shutterFactor = 1, isoFactor = 1,
  gains?: { red: number; green: number; blue: number }): SensorRawProducerInput {
  const v = loadSensorRawProducerInput(), c = v.frame.capture;
  const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _g, equivalentFocalLength35Mm: _f, ...ci } = c;
  void _s; void _e; void _g; void _f;
  const portrait = orientation.startsWith("portrait"), duration = base.exposure.shutterSeconds * shutterFactor;
  const outputRaster = { pixelWidth: portrait ? height : width, pixelHeight: portrait ? width : height };
  v.frame.capture = createSimulatedCapture({ ...ci, sceneStateId: base.fixtureId,
    geometry: { imagingArea: base.sensor.imagingArea, nativeRaster: { pixelWidth: width, pixelHeight: height }, orientation, outputRaster },
    exposure: { focalLengthMm: base.lens.focalLengthMm, aperture: base.lens.aperture,
      shutterSeconds: duration, iso: base.exposure.iso * isoFactor },
    focus: { kind: "finite", distanceM: base.focus.distanceM },
    noise: { ...ci.noise, seedUint32: base.stochasticSeedUint32 },
    whiteBalanceIntent: gains ? { stateId: "conformance-wb", source: "manual-gains", locked: true,
      channelGains: gains, sourceProfile: null } : null,
    planes: [{ ...ci.planes[0]!, ...outputRaster,
      whiteBalanceApplication: gains ? "intent-only" : "not-applicable",
      storage: { kind: "inline-float64", samples: Array<number>(width * height * 3).fill(999) } }] }).value;
  v.frame.bindingProfile = { ...v.frame.bindingProfile, nativeRaster: { pixelWidth: width, pixelHeight: height } };
  v.frame.captureModeProfile = { ...v.frame.captureModeProfile, modes: v.frame.captureModeProfile.modes.map(m => ({ ...m,
    processedImageRaster: { ...m.processedImageRaster!, value: { pixelWidth: width, pixelHeight: height } } })) };
  const templates = v.sites;
  v.sites = Array.from({ length: width * height }, (_, i) => {
    const x = i % width, y = Math.floor(i / width), phase = x % 2 + 2 * (y % 2);
    const s = structuredClone(templates[phase]!), site = { x, y };
    // Six distinguishable tile levels plus color contrast, all well below capacity.
    const mean = (40 + 30 * (Math.floor(x / 2) + 3 * Math.floor(y / 2)) + 10 * phase) * shutterFactor;
    const photo = s.charge.photoSignal;
    if (photo.kind !== "eqe-expected-counts") throw Error("EQE fixture required.");
    s.charge.photoSignal = { ...photo, site, endOffsetSecondsFromOpeningReference: duration,
      localExposureDurationSeconds: duration, expectedIncidentPhotonCount: mean * 2,
      expectedGeneratedElectronCount: mean, incidentPhotonRatePerSecond: mean * 2 / duration,
      expectedGeneratedElectronRatePerSecond: mean / duration };
    s.charge.darkCharge = { ...s.charge.darkCharge, site, endOffsetSecondsFromOpeningReference: duration,
      localExposureDurationSeconds: duration };
    s.charge.completenessProfile = { ...s.charge.completenessProfile, site, endOffsetSecondsFromOpeningReference: duration };
    s.capacityProfile = { ...s.capacityProfile, siteApplicability: { kind: "exact-site", site } };
    return s;
  });
  return v;
}

function exportInput(v: SensorRawProducerInput): PhotographicExportInput {
  const e = loadPhotographicExportInput();
  e.reconstruction = { ...e.reconstruction, rawFrame: simulateSensorRawFrame(v).value.frame,
    region: { x: 0, y: 0, width, height } };
  e.sceneProfile = { id: base.fixtureId, version: base.schemaVersion, sceneStateId: base.fixtureId };
  e.whiteBalance = v.frame.capture.whiteBalanceIntent ? "apply-resolved-sensor-gains" : "not-required";
  return e;
}

/** Independent lattice permutation, using integer pixel indices rather than engine geometry helpers. */
function nativeIndex(x: number, y: number, o: CaptureOrientation): number {
  switch (o) {
    case "landscape": return y * width + x;
    case "portrait-clockwise": return (height - 1 - x) * width + y;
    case "landscape-inverted": return (height - 1 - y) * width + width - 1 - x;
    case "portrait-counter-clockwise": return x * width + width - 1 - y;
  }
}
/** The owned kernels average each 2x2 tile. Derive directly from post-ADC integer codes. */
function channels(codes: readonly number[], index: number): number[] {
  const x = index % width, y = Math.floor(index / width), top = (y - y % 2) * width + x - x % 2;
  return [(codes[top]! - 64) / 959, (codes[top + 1]! + codes[top + width]! - 128) / (2 * 959),
    (codes[top + width + 1]! - 64) / 959];
}
function srgbCode(v: number): number {
  const x = Math.min(1, Math.max(0, v));
  return Math.floor(255 * (x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055) + .5);
}
function storedCodes(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let strip = -1, byteCount = -1;
  for (let i = 0; i < view.getUint16(8, true); i++) {
    const p = 10 + 12 * i, tag = view.getUint16(p, true);
    if (tag === 273) strip = view.getUint32(p + 8, true);
    if (tag === 279) byteCount = view.getUint32(p + 8, true);
  }
  expect(byteCount).toBe(width * height * 2); expect(strip).toBeGreaterThan(0);
  return Array.from({ length: byteCount / 2 }, (_, i) => view.getUint16(strip + 2 * i, true));
}

describe("reference-scene sensor RAW to processed output conformance", () => {
  it("preserves native charge/noise and derives every rendered pixel analytically through all orientations", async () => {
    let nativeCodes: number[] | undefined;
    for (const o of orientations) {
      const v = producer(o), e = exportInput(v), before = JSON.stringify(e), p = await createPhotographicExportPair(e);
      const codes = e.reconstruction.rawFrame.samples.map(s => s.rawCode);
      nativeCodes ??= codes;
      expect(codes).toEqual(nativeCodes); expect(storedCodes(p.dng.bytes)).toEqual(codes);
      expect(p.source.value.rawFrame.capture.noise.seedUint32).toBe(base.stochasticSeedUint32);
      expect(p.source.value.producerOriginVerified).toBe(false);
      expect(p.source.provenance.kind).toBe("approximation");
      expect(p.imageDataPairing).toBe("jpeg-generated-from-exact-attached-raw");
      const expected: number[] = [];
      for (let y = 0; y < p.rendering.value.pixelHeight; y++) for (let x = 0; x < p.rendering.value.pixelWidth; x++) {
        expected.push(...channels(codes, nativeIndex(x, y, o)).map(srgbCode));
      }
      expect(p.rendering.value.integerSamples).toEqual(expected);
      for (let i = 0; i < width * height; i++) {
        channels(codes, i).forEach((n, ch) => expect(p.source.value.linearPlane.samples[3 * i + ch]).toBeCloseTo(n, 14));
      }
      expect(JSON.stringify(e)).toBe(before);
      const again = await createPhotographicExportPair(e);
      expect(again.dng.bytes).toEqual(p.dng.bytes); expect(again.jpeg.bytes).toEqual(p.jpeg.bytes);
    }
  });

  it("distinguishes physical shutter exposure from ISO metadata and downstream rendering exposure", async () => {
    const a = producer(), b = producer("landscape", 2), iso = producer("landscape", 1, 2);
    const ra = simulateSensorRawFrame(a).value, rb = simulateSensorRawFrame(b).value, ri = simulateSensorRawFrame(iso).value;
    expect(rb.upstreamRadiometryVerified).toBe(false);
    for (let i = 0; i < width * height; i++) {
      expect(rb.sites[i]!.accumulatedCharge.value.totalExpectedStoredElectronCount)
        .toBe(2 * ra.sites[i]!.accumulatedCharge.value.totalExpectedStoredElectronCount);
      expect(rb.sites[i]!.realization.value.seedUint32).toBe(ra.sites[i]!.realization.value.seedUint32);
    }
    // ISO never silently selects a readout regime or generates extra photons.
    expect(ri.sites).toEqual(ra.sites); expect(ri.frame.samples).toEqual(ra.frame.samples);
    const e = exportInput(a), plain = await createPhotographicExportPair(e);
    e.rendering = { ...e.rendering, renderingExposureEv: 1 };
    const bright = await createPhotographicExportPair(e), isoPair = await createPhotographicExportPair(exportInput(iso));
    expect(isoPair.rendering.value.integerSamples).toEqual(plain.rendering.value.integerSamples);
    expect(storedCodes(bright.dng.bytes)).toEqual(storedCodes(plain.dng.bytes));
    expect(bright.rawDataUniqueId).toBe(plain.rawDataUniqueId); expect(bright.simulationHash).not.toBe(plain.simulationHash);
    plain.rendering.value.toneMappedLinearSamples.forEach((n, i) =>
      expect(bright.rendering.value.toneMappedLinearSamples[i]).toBeCloseTo(2 * n, 14));
    expect(bright.rendering.value.integerSamples).toEqual(plain.rendering.value.toneMappedLinearSamples.map(n => srgbCode(2 * n)));
  });

  it("applies non-neutral sensor WB once before tone/encoding while keeping identical native codes", async () => {
    const gains = { red: 2, green: 1, blue: .5 }, e = exportInput(producer("landscape", 1, 1, gains));
    e.rendering = { ...e.rendering, renderingExposureEv: 1, toneCurve: "positive-reinhard-per-channel" };
    const p = await createPhotographicExportPair(e), plain = await createPhotographicExportPair(exportInput(producer()));
    const codes = storedCodes(p.dng.bytes), gs = [gains.red, gains.green, gains.blue], expected: number[] = [];
    expect(codes).toEqual(storedCodes(plain.dng.bytes)); expect(p.rawDataUniqueId).toBe(plain.rawDataUniqueId);
    for (let i = 0; i < width * height; i++) {
      expected.push(...channels(codes, i).map((n, ch) => { const x = 2 * n * gs[ch]!; return x > 0 ? x / (1 + x) : x; }));
    }
    expected.forEach((n, i) => expect(p.rendering.value.toneMappedLinearSamples[i]).toBeCloseTo(n, 13));
    expect(p.rendering.value.integerSamples).toEqual(expected.map(srgbCode));
    expect(p.rendering.value.whiteBalanceHandling).toBe("already-applied-upstream");
  });

  it("shifts one immutable noisy capture in native coordinates and crops joint support before orientation", async () => {
    for (const o of orientations) {
      const e = exportInput(producer(o)), plain = await createPhotographicExportPair(e);
      const binding = { ...state, focusDistanceM: base.focus.distanceM, outputWidth: width, outputHeight: height };
      const g = correctionProfile.components[0]!;
      if (g.kind !== "geometry" || g.transform.kind !== "affine") throw Error("Affine fixture required.");
      e.correction = { profile: { ...correctionProfile, state: binding, components: [{ ...g,
        transform: { ...g.transform, offsetMm: { x: base.sensor.imagingArea.widthMm / width, y: 0 } } }] },
        state: binding, coordinateFrame: "native-optical-linear-srgb-d65", selections: { geometry: "on" },
        selectionKind: "camera-selectable", frameTimeSeconds: 0,
        resampler: { id: "conformance-nearest", version: "1", filter: "nearest", antialias: "none" },
        clippingLevel: 10, invalidSupport: "joint-valid-crop", outputImageStateId: "conformance-shift" };
      const identityChoice = structuredClone(e.correction);
      const component = identityChoice.profile.components[0]!;
      if (component.kind !== "geometry" || component.transform.kind !== "affine") throw Error("Affine fixture required.");
      component.transform.offsetMm = { x: 0, y: 0 };
      const identity = await createPhotographicExportPair({ ...e, correction: identityChoice });
      expect(identity.rendering.value.integerSamples).toEqual(plain.rendering.value.integerSamples);
      expect(identity.processedOutputView).toEqual(plain.processedOutputView);
      const shifted = await createPhotographicExportPair(e), codes = storedCodes(shifted.dng.bytes);
      expect(codes).toEqual(storedCodes(plain.dng.bytes)); expect(shifted.rawDataUniqueId).toBe(plain.rawDataUniqueId);
      expect(shifted.nativeDefaultCrop).toEqual(plain.nativeDefaultCrop);
      expect(shifted.source.value).toEqual(plain.source.value);
      expect(shifted.correction!.value.validSourceMask.filter(Boolean)).toHaveLength((width - 1) * height);
      const r = shifted.processedOutputView.rect, expected: number[] = [];
      for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
        const destination = nativeIndex(r.x + x, r.y + y, o);
        expect(destination % width).toBeLessThan(width - 1);
        expected.push(...channels(codes, destination + 1).map(srgbCode));
      }
      expect(shifted.rendering.value.integerSamples).toEqual(expected);
      expect(shifted.rawCorrectionIntent!.value.application).toBe("metadata-only");
    }
  });

  it("preserves below-black read noise through reconstruction and keeps display clipping distinct from capture saturation", async () => {
    const v = producer();
    for (const site of v.sites) {
      const photo = site.charge.photoSignal;
      if (photo.kind !== "eqe-expected-counts") throw Error("EQE fixture required.");
      site.charge.photoSignal = { ...photo, expectedGeneratedElectronCount: 0, expectedIncidentPhotonCount: 0,
        incidentPhotonRatePerSecond: 0, expectedGeneratedElectronRatePerSecond: 0 };
    }
    const e = exportInput(v), p = await createPhotographicExportPair(e), codes = storedCodes(p.dng.bytes);
    expect(codes.some(n => n < 64)).toBe(true);
    const expected = Array.from({ length: width * height }, (_, i) => channels(codes, i)).flat();
    expect(expected.some(n => n < 0)).toBe(true);
    expected.forEach((n, i) => expect(p.source.value.linearPlane.samples[i]).toBeCloseTo(n, 14));
    expect(p.rendering.value.integerSamples).toEqual(expected.map(srgbCode));
    expect(p.rendering.value.diagnostics.gamutClippedLowSampleCount).toBeGreaterThan(0);
    expect(e.reconstruction.rawFrame.samples.every(s => !s.physicalScalarSaturationApplied && !s.digitalSaturationApplied)).toBe(true);
    const brightInput = exportInput(producer());
    brightInput.rendering = { ...brightInput.rendering, renderingExposureEv: 8 };
    const bright = await createPhotographicExportPair(brightInput);
    expect(bright.rendering.value.diagnostics.gamutClippedHighSampleCount).toBe(width * height * 3);
    expect(bright.rendering.value.diagnostics.captureSaturation).toBe("not-consumed");
    expect(brightInput.reconstruction.rawFrame.samples.every(s => !s.physicalScalarSaturationApplied && !s.digitalSaturationApplied)).toBe(true);
  });

  it("clamps signed electronic noise only at the unsigned ADC boundary and rejects old producer model replay", () => {
    for (const blackLevelCode of [0, 64]) {
      const v = producer();
      for (const site of v.sites) {
        const photo = site.charge.photoSignal;
        if (photo.kind !== "eqe-expected-counts") throw Error("EQE fixture required.");
        site.charge.photoSignal = { ...photo, expectedGeneratedElectronCount: 0, expectedIncidentPhotonCount: 0,
          incidentPhotonRatePerSecond: 0, expectedGeneratedElectronRatePerSecond: 0 };
        const regime = site.readoutProfile.regimes[0]!;
        regime.adc.blackLevelCode = blackLevelCode;
        regime.readNoiseComponents[0]!.rmsElectrons.value = 10000;
        regime.systemConversionGainElectronsPerCode.value = .5;
      }
      const r = simulateSensorRawFrame(v).value;
      expect(r.sites.some(s => s.readout.value.lowerCodeClampApplied)).toBe(true);
      expect(r.sites.some(s => s.readout.value.preAdcSaturationApplied && s.readout.value.digitalSaturationApplied)).toBe(true);
      for (const s of r.sites) {
        const n = s.readout.value;
        expect(s.readout.provenance.modelVersion).toBe("2.0.0");
        expect(n.realizedStoredElectronEquivalentCountBeforePhysicalCapacity).toBe(0);
        expect(n.physicalScalarSaturationApplied).toBe(false);
        expect(n.electronEquivalentAfterReadNoise).toBe(n.totalElectronicReadNoiseElectrons);
        expect(n.electronEquivalentAfterPreAdcSaturation).toBe(Math.min(n.totalElectronicReadNoiseElectrons, 1000));
        const unclamped = Math.floor(Math.min(n.totalElectronicReadNoiseElectrons, 1000) / .5 + blackLevelCode + .5);
        expect(n.rawCode).toBe(Math.min(1023, Math.max(0, unclamped)));
        expect(n.lowerCodeClampApplied).toBe(unclamped < 0);
        expect(n.digitalSaturationApplied).toBe(unclamped > 1023);
      }
    }
    const v = producer();
    expect(() => parseSensorRawProducerInput({ ...v, frame: { ...v.frame, capture: { ...v.frame.capture,
      noise: { ...v.frame.capture.noise, model: { id: "photivra-native-raw-noise", version: "0.1.0" } } } } })).toThrow();
  });
});
