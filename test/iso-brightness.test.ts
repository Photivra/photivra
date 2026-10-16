// SPDX-License-Identifier: Apache-2.0

/**
 * Science review finding 3 (repro r4-iso-white.mjs): ISO must change RAW brightness like a camera's
 * programmable gain. With an exposure that is correct for each ISO (ISO 12232: reference exposure
 * proportional to 1/S), mid-grey must land on the same fraction of the effective saturation code at
 * every ISO, a clipped pixel must reach the full white level, and brightness at a fixed exposure must
 * be monotonic in ISO.
 */
import { describe, expect, it } from "vitest";
import {
  GENERIC_EQUIPMENT_TIERS, assessSensorPhysicalChargeCapacity, calculateExpectedSensorReadout, parseSensorChargeSamplingProfile,
  resolveGenericEquipmentTierCatalog, resolveGenericIsoSignalChain, simulateSensorChargeRealization, simulateSensorRawCode,
  type SensorAccumulatedChargeComposition, type SensorReadoutConversionProfile, type SensorReadoutConversionRegime
} from "../src/index.js";

const catalog = resolveGenericEquipmentTierCatalog({ presetVersion: "2.0.0" });
const evidence = [{ sourceOrigin: "photivra", sourceReference: "test:iso-brightness", reuseStatus: "photivra-owned" }] as const;
const site = { x: 1, y: 0 };
/** ISO 12232: S_sat = 78/H_sat and the metered mid-grey exposure H_m = 10/S, so H_m/H_sat = 10/78. */
const MID_GREY_FRACTION_OF_SATURATION = 10 / 78;
/** Documented tolerance for the continuous expectation: floating-point only. */
const EXPECTATION_TOLERANCE = 1e-9;

function charge(photo: number): SensorAccumulatedChargeComposition {
  const exposure = { stationarity: evidence, exposureBinding: { binding: evidence, colorSamplingProfile: evidence,
    nominalExposureDuration: evidence, openingBoundary: [], closingBoundary: [] } };
  return { completenessProfileId: "complete", colorSamplingProfileId: "photivra-generic-bayer", channelId: "green", site, bindingId: "binding",
    timeReference: "first-opening-boundary-phase", startOffsetSecondsFromOpeningReference: 0, endOffsetSecondsFromOpeningReference: 1,
    localExposureDurationSeconds: 1, photoExpectedElectronCount: photo, darkExpectedElectronCount: 0, additionalExpectedElectronCount: 0,
    totalExpectedStoredElectronCount: photo, additionalComponents: [],
    accumulatedChargeCompleteness: "complete-for-physical-storage-capacity-assessment", completenessScientificStatus: "approximation",
    allCountsAreExpectationValues: true, integerChargeSampled: false, photoSignalIncluded: true, darkChargeIncluded: true,
    otherChargeIncluded: true, darkShotNoiseApplied: false, photoShotNoiseApplied: false, readNoiseApplied: false,
    physicalFullWellAssessmentAuthorized: true, cameraSaturationAssessmentAuthorized: false, saturationAssessed: false,
    bloomingModeled: false, adcQuantizationApplied: false, rawCodeValueProduced: false,
    componentEvidence: { completeness: evidence, photoSignal: exposure, darkCurrent: { darkCurrent: evidence, siteApproximation: [], exposure } }
  } as SensorAccumulatedChargeComposition;
}
const PHYSICAL_CAPACITY = 1e6;
function capacity(c: SensorAccumulatedChargeComposition): ReturnType<typeof assessSensorPhysicalChargeCapacity>["value"] {
  return assessSensorPhysicalChargeCapacity({ accumulatedCharge: c, operatingStateId: "state", operatingTemperatureC: 20,
    capacityProfile: { schemaVersion: "0.1.0", profileId: "capacity", colorSamplingProfileId: "photivra-generic-bayer", channelId: "green",
      capacityMeaning: "physical-charge-storage-capacity-electrons", capacityElectrons: PHYSICAL_CAPACITY, scientificStatus: "approximation",
      uncertainty: { kind: "not-quantified", limitation: "test" }, evidence, siteApplicability: { kind: "exact-site", site },
      operatingState: { stateId: "state", evidence }, temperatureApplicability: { kind: "exact-reference-temperature", temperatureC: 20 } } }).value;
}
const sampling = parseSensorChargeSamplingProfile({ schemaVersion: "0.1.0", profileId: "sampling", completenessProfileId: "complete",
  scientificStatus: "approximation", photoShotNoiseModel: "poisson", darkShotNoiseModel: "poisson", additionalComponentPolicies: [],
  evidence, limitations: ["test"] });

/**
 * Noise-free code of a saturated site: the clip electrons through the same ADC transfer, including
 * any post-ADC digital gain. The development stream normalizes to this effective saturation code.
 */
function effectiveSaturationCode(r: SensorReadoutConversionRegime): number {
  const clip = Math.min(PHYSICAL_CAPACITY, r.preAdcSaturationElectronEquivalent.value);
  const adc = Math.min(2 ** r.adc.bitDepth - 1, Math.round(r.adc.blackLevelCode + clip / r.systemConversionGainElectronsPerCode.value));
  return Math.min(r.adc.digitalSaturationCode, Math.round((adc - r.adc.blackLevelCode) * (r.adc.digitalGain ?? 1) + r.adc.blackLevelCode));
}
function regimeFor(tier: (typeof GENERIC_EQUIPMENT_TIERS)[number], iso: number): { profile: SensorReadoutConversionProfile; regime: SensorReadoutConversionRegime } {
  const body = catalog.find((p) => p.tier === tier)!.body, profile = body.readout.find((a) => a.profile.channelId === "green")!.profile;
  const resolved = resolveGenericIsoSignalChain({ profile: body.signalChain, isoCapability: body.iso,
    requestedIsoSetting: { kind: "standard", exposureIndex: iso }, captureModeId: "native-still", readoutProfile: profile });
  return { profile, regime: resolved.readout.regime };
}
function isoValues(tier: (typeof GENERIC_EQUIPMENT_TIERS)[number]): readonly number[] {
  const grid = catalog.find((p) => p.tier === tier)!.body.iso.standard.settingGrid;
  if (grid.kind !== "discrete-values") throw Error("Expected discrete ISO grid");
  return grid.values;
}
function normalizedExpected(tier: (typeof GENERIC_EQUIPMENT_TIERS)[number], iso: number, electrons: number): number {
  const { profile, regime } = regimeFor(tier, iso), c = charge(electrons);
  const e = calculateExpectedSensorReadout({ accumulatedCharge: c, physicalCapacityAssessment: capacity(c), readoutProfile: profile,
    regimeId: regime.regimeId }).value;
  return (Math.min(e.expectedCodeAfterDigitalGain, regime.adc.digitalSaturationCode) - regime.adc.blackLevelCode) /
    (effectiveSaturationCode(regime) - regime.adc.blackLevelCode);
}

describe("ISO changes RAW brightness through explicit analog/digital gain (ISO 12232, EMVA 1288)", () => {
  it.each(GENERIC_EQUIPMENT_TIERS)("%s: base-ISO clip lands on the ADC full-scale white level", (tier) => {
    const { regime } = regimeFor(tier, 100);
    expect(effectiveSaturationCode(regime)).toBe(2 ** regime.adc.bitDepth - 1);
    expect(regime.adc.digitalSaturationCode).toBe(2 ** regime.adc.bitDepth - 1);
    expect([12, 14]).toContain(regime.adc.bitDepth);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s: an ISO-correct mid-grey exposure develops to the same level at every ISO", (tier) => {
    const q0 = regimeFor(tier, 100).regime.preAdcSaturationElectronEquivalent.value;
    for (const iso of isoValues(tier)) {
      const midGreyElectrons = MID_GREY_FRACTION_OF_SATURATION * q0 * 100 / iso;
      expect(Math.abs(normalizedExpected(tier, iso, midGreyElectrons) - MID_GREY_FRACTION_OF_SATURATION)).toBeLessThan(EXPECTATION_TOLERANCE);
      // A fully clipped site reaches the white level at every ISO (was 0.308 at ISO 100-400 and 0.738 above).
      expect(normalizedExpected(tier, iso, 1e5)).toBeCloseTo(1, 9);
    }
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s: at a fixed exposure brightness is monotonic in ISO, doubling per stop until clipping", (tier) => {
    const q0 = regimeFor(tier, 100).regime.preAdcSaturationElectronEquivalent.value, electrons = q0 / 1000;
    const levels = isoValues(tier).map((iso) => normalizedExpected(tier, iso, electrons));
    levels.forEach((level, i) => {
      if (i > 0) expect(level).toBeGreaterThan(levels[i - 1]!);
      expect(level).toBeCloseTo(isoValues(tier)[i]! / 100 / 1000, 9);
    });
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s: quantized noise-free codes keep mid-grey within one digital-gain step and clip exactly at white", (tier) => {
    const q0 = regimeFor(tier, 100).regime.preAdcSaturationElectronEquivalent.value;
    for (const iso of isoValues(tier)) {
      const { profile, regime } = regimeFor(tier, iso);
      const quiet = { ...profile, regimes: profile.regimes.map((r) => ({ ...r, readNoiseComponents: r.readNoiseComponents.map((n) =>
        ({ ...n, rmsElectrons: { ...n.rmsElectrons, value: 0 } })) })) };
      const code = (electrons: number): number => {
        const c = { ...charge(0), additionalExpectedElectronCount: 0 };
        // Read noise is zeroed; the realization keeps its seeded Poisson photon shot noise.
        const realization = simulateSensorChargeRealization({ accumulatedCharge: { ...c, photoExpectedElectronCount: electrons,
          totalExpectedStoredElectronCount: electrons }, samplingProfile: sampling, seedUint32: 1 }).value;
        return simulateSensorRawCode({ chargeRealization: realization, physicalCapacityAssessment: capacity({ ...c,
          photoExpectedElectronCount: electrons, totalExpectedStoredElectronCount: electrons }), readoutProfile: quiet,
        regimeId: regime.regimeId, readNoiseSeedUint32: 2 }).value.rawCode;
      };
      expect(code(q0 * 2)).toBe(effectiveSaturationCode(regime));
      const span = effectiveSaturationCode(regime) - regime.adc.blackLevelCode;
      const midGrey = MID_GREY_FRACTION_OF_SATURATION * q0 * 100 / iso;
      // Photon shot noise of the realization remains; bound it at 6 sigma plus quantization.
      const sigmaCodes = Math.sqrt(midGrey) / regime.systemConversionGainElectronsPerCode.value * (regime.adc.digitalGain ?? 1);
      const quantization = .5 * (regime.adc.digitalGain ?? 1) + .5;
      expect(Math.abs((code(midGrey) - regime.adc.blackLevelCode) / span - MID_GREY_FRACTION_OF_SATURATION))
        .toBeLessThanOrEqual((6 * sigmaCodes + quantization) / span);
    }
  });
});
