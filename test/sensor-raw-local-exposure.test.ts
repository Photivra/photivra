// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculateCaptureExposureWindows, createSimulatedCapture, simulateSensorRawFrame,
  createPhotographicExportPair, parseSensorRawProducerInput, type SensorRawProducerInput, type SensorRawProducerExposureWindowInput } from "../src/index.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

function scheduled(direction: "top-to-bottom" | "bottom-to-top" | "left-to-right" | "right-to-left" = "top-to-bottom",
  varyingDuration = false): SensorRawProducerInput {
  const v = loadSensorRawProducerInput(), evidence = v.frame.colorSamplingProfile.evidence;
  const seconds = (value: number): SensorRawProducerExposureWindowInput["nominalExposureDurationSeconds"] => ({ value, unit: "s" as const, evidence });
  v.exposureWindow = { shutterMechanism: "electronic", nominalExposureDurationSeconds: seconds(v.frame.capture.exposure.shutterSeconds),
    opening: { kind: "uniform-linear-native-scan", directionNative: { value: direction, evidence }, traversalDurationSeconds: seconds(.001) },
    closing: { kind: "uniform-linear-native-scan", directionNative: { value: direction, evidence }, traversalDurationSeconds: seconds(varyingDuration ? .002 : .001) } };
  const native = v.frame.capture.geometry.nativeRaster;
  const windows = calculateCaptureExposureWindows({ ...v.exposureWindow, nativeRaster: native,
    samplePointsNative: v.sites.map((_, i) => ({ x: i%native.pixelWidth+.5, y: Math.floor(i/native.pixelWidth)+.5 })) }).value;
  v.sites.forEach((s, i) => {
    const w = windows.samples[i]!, p = s.charge.photoSignal, d = s.charge.darkCharge;
    for (const event of [p, d, s.charge.completenessProfile]) {
      event.startOffsetSecondsFromOpeningReference = w.startOffsetSecondsFromOpeningReference;
      event.endOffsetSecondsFromOpeningReference = w.endOffsetSecondsFromOpeningReference;
    }
    p.localExposureDurationSeconds = d.localExposureDurationSeconds = w.localExposureDurationSeconds;
    p.expectedIncidentPhotonCount = p.incidentPhotonRatePerSecond*w.localExposureDurationSeconds;
    p.expectedGeneratedElectronCount = p.expectedGeneratedElectronRatePerSecond*w.localExposureDurationSeconds;
    d.expectedDarkElectronCount = d.darkCurrentElectronsPerSecond*w.localExposureDurationSeconds;
  });
  return v;
}

describe("RAW producer local shutter windows", () => {
  it("preserves the original global event and RAW realization when timing is omitted or explicitly simultaneous", () => {
    const v = loadSensorRawProducerInput(), original = simulateSensorRawFrame(v).value;
    v.exposureWindow = { shutterMechanism: "mechanical", nominalExposureDurationSeconds: {
      value: v.frame.capture.exposure.shutterSeconds, unit: "s", evidence: v.frame.colorSamplingProfile.evidence },
    opening: { kind: "simultaneous" }, closing: { kind: "simultaneous" } };
    const explicit = simulateSensorRawFrame(v).value;
    expect(original.localExposureWindows).toBeUndefined();
    expect(explicit.frame).toEqual(original.frame); expect(explicit.sites).toEqual(original.sites);
    expect(explicit.localExposureWindows!.value.samples.every((s) => s.startOffsetSecondsFromOpeningReference === 0)).toBe(true);
  });
  it("retains exact native site centers and seed ownership through all scan directions and orientations", () => {
    for (const direction of ["top-to-bottom", "bottom-to-top", "left-to-right", "right-to-left"] as const) {
      const v = scheduled(direction), baseline = simulateSensorRawFrame(v).value;
      for (const orientation of ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const) {
        const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _g, equivalentFocalLength35Mm: _f, ...c } = v.frame.capture;
        void _s; void _e; void _g; void _f;
        v.frame.capture = createSimulatedCapture({ ...c, geometry: { ...c.geometry, orientation } }).value;
        const before = JSON.stringify(v), r = simulateSensorRawFrame(v).value;
        expect(JSON.stringify(v)).toBe(before); expect(simulateSensorRawFrame(v).value).toEqual(r);
        expect(r.frame.samples).toEqual(baseline.frame.samples);
        expect(r.localExposureWindows).toEqual(baseline.localExposureWindows);
        expect(r.localExposureWindows!.value.samples.map((s) => s.pointNative)).toEqual([
          { x: .5, y: .5 }, { x: 1.5, y: .5 }, { x: .5, y: 1.5 }, { x: 1.5, y: 1.5 }]);
      }
    }
  });
  it("uses site-specific durations without changing rates or conflating nominal and local exposure", () => {
    const v = scheduled("top-to-bottom", true);
    v.sites.forEach((s) => { s.charge.darkCharge.darkCurrentElectronsPerSecond = 5;
      s.charge.darkCharge.expectedDarkElectronCount = 5*s.charge.darkCharge.localExposureDurationSeconds; });
    const r = simulateSensorRawFrame(v).value;
    for (let i = 0; i < v.sites.length; i++) {
      const p = v.sites[i]!.charge.photoSignal, w = r.localExposureWindows!.value.samples[i]!;
      expect(w.startOffsetSecondsFromOpeningReference).toBe(i < 2 ? .00025 : .00075);
      expect(w.localExposureDurationSeconds).toBe(w.endOffsetSecondsFromOpeningReference-w.startOffsetSecondsFromOpeningReference);
      expect(r.sites[i]!.accumulatedCharge.value.totalExpectedStoredElectronCount).toBe(p.expectedGeneratedElectronCount+5*w.localExposureDurationSeconds);
    }
    expect(r.upstreamRadiometryVerified).toBe(false);
  });
  it("exports exact local-window RAW codes and develops JPEG from the same realized frame", async () => {
    const r = simulateSensorRawFrame(scheduled("right-to-left", true)).value, v = loadPhotographicExportInput();
    v.reconstruction.rawFrame = r.frame;
    const pair = await createPhotographicExportPair(v), bytes = pair.dng.bytes;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let strip = -1;
    for (let i = 0; i < view.getUint16(8, true); i++) {
      const offset = 10+12*i; if (view.getUint16(offset, true) === 273) strip = view.getUint32(offset+8, true);
    }
    expect(strip).toBeGreaterThan(0);
    expect(Array.from({ length: 4 }, (_, i) => view.getUint16(strip+2*i, true))).toEqual(r.frame.samples.map((s) => s.rawCode));
    expect(pair.source.value.rawFrame.samples).toEqual(r.frame.samples);
    expect(pair.imageDataPairing).toBe("jpeg-generated-from-exact-attached-raw");
    expect((await createPhotographicExportPair(v)).jpeg.sha256).toBe(pair.jpeg.sha256);
  });
  it("rejects stale photo/dark/completeness events, missing schedule and duration mismatch", () => {
    const noSchedule = scheduled(); delete noSchedule.exposureWindow;
    expect(() => simulateSensorRawFrame(noSchedule)).toThrow();
    for (const component of ["photoSignal", "darkCharge", "completenessProfile"] as const) {
      const v = scheduled(); v.sites[0]!.charge[component].startOffsetSecondsFromOpeningReference += .001;
      expect(() => simulateSensorRawFrame(v)).toThrow();
    }
    const nominal = scheduled(); nominal.exposureWindow!.nominalExposureDurationSeconds.value *= 2;
    expect(() => simulateSensorRawFrame(nominal)).toThrow(/nominal duration/);
    const changed = scheduled(); changed.exposureWindow!.opening = { kind: "simultaneous" };
    expect(() => simulateSensorRawFrame(changed)).toThrow();
  });
  it("rejects caller-owned sampling/crop/raster, malformed timing, unsupported schedules and unobserved invalid corners", () => {
    for (const extra of [{ samplePointsNative: [] }, { nativeRaster: { pixelWidth: 2, pixelHeight: 2 } },
      { activeCaptureRect: { x: 0, y: 0, width: 2, height: 2 } }, { debug: "private" }]) {
      const v = scheduled(); v.exposureWindow = { ...v.exposureWindow!, ...extra };
      expect(() => parseSensorRawProducerInput(v)).toThrow();
    }
    expect(() => parseSensorRawProducerInput({ ...scheduled(), exposureWindow: null })).toThrow();
    for (const bad of [{ kind: "unknown" }, { kind: "simultaneous", debug: "private" },
      { kind: "uniform-linear-native-scan", directionNative: null, traversalDurationSeconds: null }]) {
      const v = scheduled(); v.exposureWindow!.opening = bad as SensorRawProducerExposureWindowInput["opening"];
      expect(() => simulateSensorRawFrame(v)).toThrow();
    }
    const corners = scheduled(), evidence = corners.frame.colorSamplingProfile.evidence;
    corners.exposureWindow!.opening = { kind: "uniform-linear-native-scan", directionNative: { value: "top-to-bottom", evidence },
      traversalDurationSeconds: { value: 2*corners.frame.capture.exposure.shutterSeconds, unit: "s", evidence } };
    corners.exposureWindow!.closing = { kind: "simultaneous" };
    expect(() => simulateSensorRawFrame(corners)).toThrow(/zero or negative/);
  });
});
