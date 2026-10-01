// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { simulateSensorRawFrame, parseSensorRawProducerInput, createSimulatedCapture, createPhotographicExportPair,
  simulateSensorChargeRealization, simulateSensorRawCode, type SensorRawProducerInput } from "../src/index.js";
import { loadSensorRawProducerInput as input } from "./helpers/sensor-raw-producer-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

describe("engine-produced native sensor RAW frame", () => {
  it("runs the existing charge/capacity/noise/ADC primitives with exact capture-owned site seeds and no mutation", () => {
    const v = input(), before = JSON.stringify(v), r = simulateSensorRawFrame(v);
    expect(r.value.codeProducer).toBe("engine-charge-capacity-noise-adc"); expect(r.value.upstreamRadiometryVerified).toBe(false);
    expect(r.value.frame.capture).toEqual(v.frame.capture); expect(JSON.stringify(v)).toBe(before);
    expect(simulateSensorRawFrame(v)).toEqual(r); expect(Object.isFrozen(r.value.frame.samples)).toBe(true);
    for (let i = 0; i < 4; i++) {
      const site = r.value.sites[i]!, s = v.sites[i]!;
      const chargeSeed = (v.frame.capture.noise.seedUint32+2*i) >>> 0;
      const readSeed = (v.frame.capture.noise.seedUint32+2*i+1) >>> 0;
      expect(site.realization).toEqual(simulateSensorChargeRealization({ accumulatedCharge: site.accumulatedCharge.value,
        samplingProfile: s.samplingProfile, seedUint32: chargeSeed }));
      expect(site.readout).toEqual(simulateSensorRawCode({ chargeRealization: site.realization.value,
        physicalCapacityAssessment: site.capacity.value, readoutProfile: s.readoutProfile, regimeId: s.regimeId, readNoiseSeedUint32: readSeed }));
      expect(r.value.frame.samples[i]!.rawCode).toBe(site.readout.value.rawCode);
      expect(r.value.frame.samples[i]!.sourceChargeSeedUint32).toBe(chargeSeed);
      expect(r.value.frame.samples[i]!.sourceReadNoiseSeedUint32).toBe(readSeed);
    }
  });
  it("keeps native CFA through all orientations and uses a stable wrap-safe seed schedule", () => {
    for (const orientation of ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const) {
      const v = input(), c = v.frame.capture;
      const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _g, equivalentFocalLength35Mm: _f, ...raw } = c;
      void _s; void _e; void _g; void _f;
      v.frame.capture = createSimulatedCapture({ ...raw, geometry: { ...raw.geometry, orientation },
        noise: { ...raw.noise, seedUint32: 0xffffffff } }).value;
      const r = simulateSensorRawFrame(v).value;
      expect(r.frame.samples.map((s) => s.sourceChargeSeedUint32)).toEqual([0xffffffff, 1, 3, 5]);
      expect(r.frame.samples.map((s) => s.sourceReadNoiseSeedUint32)).toEqual([0, 2, 4, 6]);
      expect(r.frame.samples.map((s) => s.channelId)).toEqual(["red", "green", "green", "blue"]);
      expect(r.frame.samples.map((s) => s.colorSamplingSite)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
    }
  });
  it("reports physical, pre-ADC and digital saturation separately without rewriting expected charge", () => {
    const v = input(), s = v.sites[3]!, regime = s.readoutProfile.regimes[0]!;
    s.capacityProfile.capacityElectrons = 100;
    regime.preAdcSaturationElectronEquivalent.value = 90; regime.systemConversionGainElectronsPerCode.value = .01;
    const r = simulateSensorRawFrame(v).value, site = r.sites[3]!;
    expect(site.accumulatedCharge.value.totalExpectedStoredElectronCount).toBe(800);
    expect(site.capacity.value.expectedChargeExceedsCapacity).toBe(true);
    expect(site.readout.value.physicalScalarSaturationApplied).toBe(true);
    expect(site.readout.value.preAdcSaturationApplied).toBe(true); expect(site.readout.value.digitalSaturationApplied).toBe(true);
    expect(r.frame.samples[3]!.rawCode).toBe(1023); expect(site.readout.value.bloomingModeled).toBe(false);
  });
  it("rejects stale site/channel/time/temperature/completeness, treated charge, unknown fields and missing coverage", () => {
    expect(() => parseSensorRawProducerInput(null)).toThrow(); expect(() => parseSensorRawProducerInput({ ...input(), debug: true })).toThrow();
    for (const patch of [{ kind: "responsivity-photocurrent-charge" }, { site: { x: 1, y: 0 } }, { channelId: "blue" },
      { bindingId: "stale" }, { startOffsetSecondsFromOpeningReference: 1 }, { endOffsetSecondsFromOpeningReference: 1 },
      { adcQuantizationApplied: true }, { shotNoiseApplied: true }, { expectedGeneratedElectronCount: -1 },
      { incidentPhotonRatePerSecond: NaN }, { expectedIncidentPhotonCount: 1 }, { debug: "private" }]) {
      const v = input(); v.sites[0]!.charge.photoSignal = { ...v.sites[0]!.charge.photoSignal, ...patch } as SensorRawProducerInput["sites"][number]["charge"]["photoSignal"];
      expect(() => simulateSensorRawFrame(v)).toThrow();
    }
    const missing = input(); missing.sites = missing.sites.slice(1); expect(() => simulateSensorRawFrame(missing)).toThrow();
    const sparse = input(); sparse.sites = Array(4); expect(() => simulateSensorRawFrame(sparse)).toThrow();
    const reversed = input(); reversed.sites = [...reversed.sites].reverse(); expect(() => simulateSensorRawFrame(reversed)).toThrow();
    const t = input(); t.sites[0]!.charge.darkCharge.operatingTemperatureC = 21; expect(() => simulateSensorRawFrame(t)).toThrow();
    const c = input(); c.sites[0]!.charge.completenessProfile.includedAdditionalComponentIds = ["missing"]; expect(() => simulateSensorRawFrame(c)).toThrow();
    const seed = input(); expect(() => parseSensorRawProducerInput({ ...seed, frame: { ...seed.frame,
      capture: { ...seed.frame.capture, noise: { ...seed.frame.capture.noise, model: { id: "wrong", version: "1" } } } } })).toThrow();
  });
  it("exports exact engine-produced codes to DNG and develops JPEG from that RAW, not an independent capture plane", async () => {
    const v = input(), r = simulateSensorRawFrame(v).value, exportInput = loadPhotographicExportInput();
    exportInput.reconstruction.rawFrame = r.frame;
    const p = await createPhotographicExportPair(exportInput), bytes = p.dng.bytes, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let strip = -1;
    for (let i = 0; i < view.getUint16(8, true); i++) {
      const offset = 10+12*i; if (view.getUint16(offset, true) === 273) strip = view.getUint32(offset+8, true);
    }
    expect(strip).toBeGreaterThan(0);
    expect(Array.from({ length: 4 }, (_, i) => view.getUint16(strip+2*i, true))).toEqual(r.frame.samples.map((s) => s.rawCode));
    expect(p.imageDataPairing).toBe("jpeg-generated-from-exact-attached-raw"); expect(p.source.value.rawFrame.samples).toEqual(r.frame.samples);
    expect(p.jpeg.bytes[0]).toBe(255); expect(p.jpeg.bytes[1]).toBe(216);
    expect((await createPhotographicExportPair(exportInput)).jpeg.sha256).toBe(p.jpeg.sha256);
  });
});
