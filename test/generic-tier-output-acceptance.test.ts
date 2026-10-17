// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { GENERIC_EQUIPMENT_TIERS, resolveGenericEquipmentTierCatalog, resolveGenericIsoSignalChain,
  createSimulatedCapture, simulateSensorRawFrame, createPhotographicExportPair,
  type GenericEquipmentTier, type CaptureOrientation, type SensorRawProducerInput, type PhotographicExportInput
} from "../src/index.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

const catalog = resolveGenericEquipmentTierCatalog({ presetVersion: "2.0.0" });
const orientations = ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const;
/** Explicit test registration: the owned 2x2 Bayer layout and native still mode
 * are declared under the IDs required by the exact body assets. No CFA is inferred. */
function registered<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll('"cfa"', '"photivra-generic-bayer"')
    .replaceAll('"native"', '"native-still"')) as T;
}
function producer(tier: GenericEquipmentTier, iso: number, orientation: CaptureOrientation = "landscape"): SensorRawProducerInput {
  const v = registered(loadSensorRawProducerInput()), body = catalog.find((p) => p.tier === tier)!.body;
  const c = v.frame.capture;
  const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _g, equivalentFocalLength35Mm: _f, ...input } = c;
  void _s; void _e; void _g; void _f;
  v.frame.capture = createSimulatedCapture({ ...input, geometry: { ...input.geometry, orientation },
    exposure: { ...input.exposure, iso } }).value;
  v.sites = v.sites.map((site) => {
    const readoutProfile = body.readout.find((asset) => asset.profile.channelId === site.charge.photoSignal.channelId)!.profile;
    const selection = resolveGenericIsoSignalChain({ profile: body.signalChain, isoCapability: body.iso,
      requestedIsoSetting: { kind: "standard", exposureIndex: iso }, captureModeId: "native-still", readoutProfile });
    return { ...site, readoutProfile, regimeId: selection.readout.regime.regimeId };
  });
  return v;
}
function output(v: SensorRawProducerInput): PhotographicExportInput {
  const e = registered(loadPhotographicExportInput());
  e.reconstruction = { ...e.reconstruction, rawFrame: simulateSensorRawFrame(v).value.frame };
  return e;
}
function codes(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = -1, count = -1;
  for (let i = 0; i < view.getUint16(8, true); i++) {
    const p = 10 + i * 12, tag = view.getUint16(p, true);
    if (tag === 273) offset = view.getUint32(p + 8, true);
    if (tag === 279) count = view.getUint32(p + 8, true) / 2;
  }
  if (count !== 4 || offset < 0) throw Error("Expected bounded four-site DNG");
  return Array.from({ length: count }, (_, i) => view.getUint16(offset + 2 * i, true));
}
describe("tier readout to paired output acceptance", () => {
  it.each(GENERIC_EQUIPMENT_TIERS)("%s maps ISO to explicit gain regimes without changing expected photons or charge realization", (tier) => {
    const low = simulateSensorRawFrame(producer(tier, 100)).value;
    const mid = simulateSensorRawFrame(producer(tier, 400)).value;
    const high = simulateSensorRawFrame(producer(tier, 800)).value;
    const body = catalog.find((p) => p.tier === tier)!.body;
    const base = body.readout[0]!.profile.regimes[0]!;
    expect(low.upstreamRadiometryVerified).toBe(false);
    for (let i = 0; i < 4; i++) {
      const a = low.sites[i]!, m = mid.sites[i]!, b = high.sites[i]!;
      for (const other of [m, b]) {
        expect(other.accumulatedCharge).toEqual(a.accumulatedCharge);
        expect(other.capacity).toEqual(a.capacity);
        expect(other.realization).toEqual(a.realization);
      }
      expect([a, m, b].map((site) => site.readout.value.regimeId)).toEqual(["iso-100", "iso-400", "iso-800"]);
      // Conversion gain in DN/e- scales with ISO: electrons per code fall by the ISO ratio.
      expect(m.readout.value.systemConversionGainElectronsPerCode).toBeCloseTo(a.readout.value.systemConversionGainElectronsPerCode / 4, 12);
      expect(b.readout.value.systemConversionGainElectronsPerCode).toBeCloseTo(a.readout.value.systemConversionGainElectronsPerCode / 8, 12);
      // Same low-conversion-gain read noise at ISO 100-400; lower input-referred noise in the high-conversion-gain mode.
      expect(m.readout.value.electronicReadNoiseComponents[0]!.rmsElectrons).toBe(a.readout.value.electronicReadNoiseComponents[0]!.rmsElectrons);
      expect(b.readout.value.electronicReadNoiseComponents[0]!.rmsElectrons).toBeLessThan(a.readout.value.electronicReadNoiseComponents[0]!.rmsElectrons);
      for (const sample of [a.readout.value, m.readout.value, b.readout.value]) {
        const signed = Math.min(sample.electronEquivalentAfterPhysicalScalarSaturation + sample.totalElectronicReadNoiseElectrons,
          sample.preAdcSaturationElectronEquivalent);
        const quantized = Math.round(signed / sample.systemConversionGainElectronsPerCode + base.adc.blackLevelCode);
        expect(sample.rawCode).toBe(Math.max(0, Math.min(base.adc.digitalSaturationCode, quantized)));
        expect(sample.lowerCodeClampApplied).toBe(quantized < 0);
        expect(sample.digitalGain).toBe(1);
        expect(sample.physicalChargeCapacityElectrons).toBe(1000); // Independent synthetic storage contract, not ADC white.
      }
    }
    expect(high.frame.samples.map((sample) => sample.rawCode)).not.toEqual(low.frame.samples.map((sample) => sample.rawCode));
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s rejects a readout regime whose ISO gain differs from the committed capture ISO", (tier) => {
    const isoMetadata = producer(tier, 800);
    isoMetadata.sites = isoMetadata.sites.map((site) => ({ ...site, regimeId: "iso-100" }));
    expect(() => simulateSensorRawFrame(isoMetadata)).toThrow(/ISO gain differs/);
    // Unsupported ISO fails in the upstream capability resolver, not a hidden RAW noise equation.
    expect(() => producer(tier, 300)).toThrow();
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s fixed-pattern noise is opt-in, deterministic per sensor instance and frame-uniform", (tier) => {
    const fixedPatternNoise = catalog.find((p) => p.tier === tier)!.body.fixedPatternNoise.profile;
    const plain = producer(tier, 100), patterned = producer(tier, 100);
    patterned.sites = patterned.sites.map((site) => ({ ...site, fixedPatternNoise }));
    const a = simulateSensorRawFrame(plain).value, b = simulateSensorRawFrame(patterned).value;
    expect(a.sites.every((site) => site.realization.value.fixedPatternNoiseProfileId === null)).toBe(true);
    expect(b.sites.every((site) => site.realization.value.fixedPatternNoiseProfileId === fixedPatternNoise.profileId)).toBe(true);
    expect(b.sites.map((site) => site.readout.value.fixedPatternReadoutOffsetElectrons)).not.toEqual([0, 0, 0, 0]);
    expect(simulateSensorRawFrame(patterned).value.frame.samples).toEqual(b.frame.samples);
    // A different capture seed changes temporal noise but not the sensor's pattern.
    const reseeded = producer(tier, 100);
    reseeded.frame.capture = { ...reseeded.frame.capture, noise: { ...reseeded.frame.capture.noise, seedUint32: 999 } };
    reseeded.sites = reseeded.sites.map((site) => ({ ...site, fixedPatternNoise }));
    const c = simulateSensorRawFrame(reseeded).value;
    expect(c.sites.map((site) => site.realization.value.photoResponseGainFactor))
      .toEqual(b.sites.map((site) => site.realization.value.photoResponseGainFactor));
    const mixed = producer(tier, 100);
    mixed.sites = mixed.sites.map((site, i) => (i === 0 ? { ...site, fixedPatternNoise } : site));
    expect(() => simulateSensorRawFrame(mixed)).toThrow(/fixed-pattern identity/);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s paired export preserves each native regime capture through orientation and rendering exposure", async (tier) => {
    for (const iso of [100, 800]) {
      let nativeCodes: number[] | undefined;
      for (const orientation of orientations) {
        const e = output(producer(tier, iso, orientation));
        const expected = e.reconstruction.rawFrame.samples.map((sample) => sample.rawCode);
        nativeCodes ??= expected;
        expect(expected).toEqual(nativeCodes);
        const before = JSON.stringify(e.reconstruction.rawFrame), plain = await createPhotographicExportPair(e);
        const bright = await createPhotographicExportPair({ ...e, rendering: { ...e.rendering, renderingExposureEv: 1 } });
        expect(codes(plain.dng.bytes)).toEqual(expected);
        expect(codes(bright.dng.bytes)).toEqual(expected);
        expect(bright.rawDataUniqueId).toBe(plain.rawDataUniqueId);
        expect(bright.rendering.value.integerSamples).not.toEqual(plain.rendering.value.integerSamples);
        expect(plain.imageDataPairing).toBe("jpeg-generated-from-exact-attached-raw");
        expect(plain.source.value.producerOriginVerified).toBe(false);
        expect(JSON.stringify(e.reconstruction.rawFrame)).toBe(before);
        expect((await createPhotographicExportPair(e)).jpeg.bytes).toEqual(plain.jpeg.bytes);
      }
    }
  });
});
