// SPDX-License-Identifier: Apache-2.0

/*
 * 2.0.0: every parse*() record parser and every record-taking function rejects unknown fields at
 * every object level, with InvalidConfigurationError naming the field. Old schema versions still
 * parse with their own fields, and everything the engine writes parses again.
 */

import { describe, expect, it } from "vitest";

import {
  InvalidConfigurationError,
  calculateEffectiveSaturationCode,
  createSimulatedCapture,
  parseFlashSyncCapabilityProfile,
  parseFrontOfLensFilterProfile,
  parsePhotographicExportInput,
  parseSceneIlluminationProfile,
  parseSensorArchitectureProfile,
  parseSensorRawFrameInput,
  parseSensorRawProducerInput,
  parseSimulatedCapture,
  prepareColorMatchingFunctions,
  serializeSimulatedCapture,
  validateCalculationQuality
} from "../src/index.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { loadSensorRawFrameInput } from "./helpers/sensor-raw-frame-fixture.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";

type Path = readonly (string | number)[];

const evidence = (reference: string): { sourceOrigin: "photivra"; sourceReference: string; reuseStatus: "photivra-owned" }[] =>
  [{ sourceOrigin: "photivra", sourceReference: reference, reuseStatus: "photivra-owned" }];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Every plain-object level of a record: the root, nested objects and array elements. */
function objectPaths(value: unknown, at: Path = [], out: Path[] = []): Path[] {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => objectPaths(entry, [...at, index], out));
  } else if (isPlainRecord(value)) {
    out.push(at);
    for (const [key, child] of Object.entries(value)) objectPaths(child, [...at, key], out);
  }
  return out;
}

function withUnknownField<T>(record: T, path: Path, field = "unexpectedField"): T {
  const copy = structuredClone(record);
  let target = copy as unknown as Record<string | number, unknown>;
  for (const step of path) target = target[step] as Record<string | number, unknown>;
  target[field] = 1;
  return copy;
}

/**
 * The record parses, and adding one unknown field at any object level is rejected by name. Derived
 * blocks that the parser recomputes and compares as a whole (`derived`) are rejected with the
 * domain's consistency message instead.
 */
function expectStrictAtEveryLevel<T>(parse: (value: T) => unknown, record: T, derived: readonly string[] = []): number {
  expect(() => parse(structuredClone(record))).not.toThrow();
  const paths = objectPaths(record);
  for (const path of paths) {
    const where = path.join(".") || "<root>";
    let error: unknown;
    try { parse(withUnknownField(record, path)); } catch (caught) { error = caught; }
    expect(error, where).toBeInstanceOf(InvalidConfigurationError);
    if (!path.some((step) => derived.includes(String(step)))) expect((error as Error).message, where).toMatch(/unknown field "unexpectedField"/i);
  }
  return paths.length;
}

function filterProfile(schemaVersion: "0.1.0" | "0.2.0"): Record<string, unknown> {
  return {
    schemaVersion, filterId: "generic-filter", profileVersion: "1.0.0", identityScope: "photivra-generic-unbranded",
    position: "front-of-lens", scientificStatus: "approximation", wavelengthBasis: "air",
    wavelengthRangeNanometers: { minimum: 400, maximum: 700 },
    transmission: schemaVersion === "0.1.0"
      ? { kind: "neutral-linear-transmission", linearTransmissionFactor: { value: 0.5, evidence: evidence("nd") } }
      : { kind: "linear-polarizer", principalTransmittance: { value: 0.8, evidence: evidence("k1") },
        extinctionRatio: { value: 1e6, evidence: evidence("er") }, transmissionAxisDegrees: 30 },
    uncertainty: { kind: "not-quantified", limitation: "Generic filter." },
    polarizationModeled: schemaVersion === "0.2.0", wavelengthChangingBehaviorModeled: false,
    evidence: evidence("filter"), limitations: ["Synthetic filter."]
  };
}

function flashSync(schemaVersion: "0.1.0" | "0.2.0"): Record<string, unknown> {
  return {
    schemaVersion, profileId: "sync", profileVersion: "1", captureModeId: "still", timingProfileId: "timing",
    supportedOrdinarySyncModes: ["front-curtain", "rear-curtain"], highSpeedSyncSupported: schemaVersion === "0.2.0",
    ...(schemaVersion === "0.2.0" ? { highSpeedSync: { burstEnergyFractionOfFullPulse: 0.8, evidence: evidence("hss") } } : {}),
    ordinarySyncRequiresWholeActiveFrameSimultaneouslyExposed: true, evidence: evidence("sync"), limitations: ["Generic sync."]
  };
}

function architecture(schemaVersion: "0.2.0" | "0.3.0"): Record<string, unknown> {
  return {
    schemaVersion,
    illumination: { value: "bsi", evidence: evidence("bsi") },
    readoutCapabilities: [{ value: "rolling", evidence: evidence("rolling") }],
    ...(schemaVersion === "0.3.0" ? { technologyFamily: { value: "cmos", evidence: evidence("cmos") } } : {})
  };
}

const uncertainty = { kind: "relative", fraction: 0.05, basis: "Synthetic calibration." };
const illuminationProfile = {
  schemaVersion: "0.1.0", profileId: "lights", sceneId: "room", evidence: evidence("lights"),
  sources: [
    { sourceId: "point", family: "point", enabled: true, geometry: { kind: "point-position", positionM: { x: 0, y: 3, z: 1 } },
      magnitude: { kind: "radiant-intensity", wattsPerSteradian: 2, scientificStatus: "calibrated", uncertainty, evidence: evidence("i") },
      spectrum: { kind: "blackbody-temperature-approximation", temperatureKelvin: 3200, limitation: "Planckian shape only." },
      temporalBehavior: { kind: "time-invariant" }, evidence: evidence("point") },
    { sourceId: "spot", family: "spot", enabled: true,
      geometry: { kind: "spot", origin: { kind: "scene-object-binding", sceneObjectId: "lamp" },
        directionUnitVector: { x: 0, y: -1, z: 0 }, outerConeAngleDegrees: 40 },
      magnitude: { kind: "relative-linear-scale", scale: 1, scientificStatus: "approximation", limitation: "Relative only." },
      spectrum: { kind: "unresolved", limitation: "Unknown spectrum." },
      temporalBehavior: { kind: "time-invariant" }, evidence: evidence("spot"), limitations: ["Synthetic spot."] }
  ]
};

describe("strict versioned records: unknown fields at every level (2.0.0)", () => {
  it("rejects an unknown field at every level of hand-built profiles, for each accepted schema version", () => {
    let levels = 0;
    levels += expectStrictAtEveryLevel(parseSceneIlluminationProfile, illuminationProfile);
    for (const version of ["0.1.0", "0.2.0"] as const) {
      levels += expectStrictAtEveryLevel(parseFrontOfLensFilterProfile, filterProfile(version));
      levels += expectStrictAtEveryLevel(parseFlashSyncCapabilityProfile, flashSync(version));
    }
    for (const version of ["0.2.0", "0.3.0"] as const) {
      levels += expectStrictAtEveryLevel(parseSensorArchitectureProfile, architecture(version));
    }
    expect(levels).toBeGreaterThan(40);
  });

  it("rejects an unknown field at every level of the committed capture, RAW-frame, producer and export fixtures", () => {
    const capture = createSimulatedCapture(loadLinearCaptureInput()).value;
    // resolvedGeometry is recomputed and compared as a whole ("Archived derived capture metadata is inconsistent.").
    expect(expectStrictAtEveryLevel(parseSimulatedCapture, capture, ["resolvedGeometry"])).toBeGreaterThan(10);
    expect(expectStrictAtEveryLevel(parseSensorRawFrameInput, loadSensorRawFrameInput(), ["resolvedGeometry"])).toBeGreaterThan(20);
    expect(expectStrictAtEveryLevel(parseSensorRawProducerInput, loadSensorRawProducerInput(), ["resolvedGeometry"])).toBeGreaterThan(40);
    expect(expectStrictAtEveryLevel(parsePhotographicExportInput, loadPhotographicExportInput(), ["resolvedGeometry"])).toBeGreaterThan(40);
  });

  it("names the path and the field", () => {
    expect(() => parseSceneIlluminationProfile(withUnknownField(illuminationProfile, ["sources", 0, "magnitude", "uncertainty"], "fractionPercent")))
      .toThrow(new InvalidConfigurationError('sceneIlluminationProfile.sources[0].magnitude.uncertainty has unknown field "fractionPercent".'));
    expect(() => parseFrontOfLensFilterProfile(withUnknownField(filterProfile("0.2.0"), ["transmission", "extinctionRatio"], "valuePercent")))
      .toThrow(new InvalidConfigurationError('frontOfLensFilterProfile.transmission.extinctionRatio has unknown field "valuePercent".'));
    expect(() => parseFlashSyncCapabilityProfile(withUnknownField(flashSync("0.2.0"), ["highSpeedSync", "evidence", 0], "url")))
      .toThrow(new InvalidConfigurationError('flashSyncCapabilityProfile.highSpeedSync.evidence[0] has unknown field "url".'));
  });

  it("rejects a field that belongs to another variant of the same record", () => {
    const relativeWithIntensity = structuredClone(illuminationProfile);
    (relativeWithIntensity.sources[1]!.magnitude as Record<string, unknown>).wattsPerSteradian = 2;
    expect(() => parseSceneIlluminationProfile(relativeWithIntensity))
      .toThrow(new InvalidConfigurationError('sceneIlluminationProfile.sources[1].magnitude has unknown field "wattsPerSteradian".'));
    const relativeWithLimitation = withUnknownField(illuminationProfile, ["sources", 0, "magnitude", "uncertainty"], "limitation");
    expect(() => parseSceneIlluminationProfile(relativeWithLimitation))
      .toThrow(new InvalidConfigurationError('sceneIlluminationProfile.sources[0].magnitude.uncertainty has unknown field "limitation".'));
    const neutralWithAxis = withUnknownField(filterProfile("0.1.0"), ["transmission"], "transmissionAxisDegrees");
    expect(() => parseFrontOfLensFilterProfile(neutralWithAxis))
      .toThrow(new InvalidConfigurationError('frontOfLensFilterProfile.transmission has unknown field "transmissionAxisDegrees".'));
  });

  it("keeps older schema versions parsing with only their own fields, and keeps their version-specific messages", () => {
    expect(parseFrontOfLensFilterProfile(filterProfile("0.1.0")).schemaVersion).toBe("0.1.0");
    expect(parseFlashSyncCapabilityProfile(flashSync("0.1.0")).schemaVersion).toBe("0.1.0");
    expect(parseSensorArchitectureProfile(architecture("0.2.0")).schemaVersion).toBe("0.2.0");
    expect(() => parseSensorArchitectureProfile({ ...architecture("0.2.0"), technologyFamily: { value: "cmos", evidence: evidence("x") } }))
      .toThrow("sensorArchitecture schema 0.2.0 does not support technologyFamily; use schema 0.3.0.");
    expect(() => parseFlashSyncCapabilityProfile({ ...flashSync("0.1.0"), highSpeedSync: { burstEnergyFractionOfFullPulse: 0.8, evidence: evidence("x") } }))
      .toThrow(InvalidConfigurationError);
  });
});

describe("round-trips: everything the engine writes parses again (2.0.0)", () => {
  it("parses each parser's own output to the same value", () => {
    const cases: [string, (value: never) => unknown, unknown][] = [
      ["illumination", parseSceneIlluminationProfile, illuminationProfile],
      ["filter 0.1.0", parseFrontOfLensFilterProfile, filterProfile("0.1.0")],
      ["filter 0.2.0", parseFrontOfLensFilterProfile, filterProfile("0.2.0")],
      ["flash sync 0.1.0", parseFlashSyncCapabilityProfile, flashSync("0.1.0")],
      ["flash sync 0.2.0", parseFlashSyncCapabilityProfile, flashSync("0.2.0")],
      ["architecture 0.2.0", parseSensorArchitectureProfile, architecture("0.2.0")],
      ["architecture 0.3.0", parseSensorArchitectureProfile, architecture("0.3.0")],
      ["RAW frame", parseSensorRawFrameInput, loadSensorRawFrameInput()],
      ["RAW producer", parseSensorRawProducerInput, loadSensorRawProducerInput()],
      ["photographic export", parsePhotographicExportInput, loadPhotographicExportInput()]
    ];
    for (const [name, parse, record] of cases) {
      const once = parse(structuredClone(record) as never);
      expect(parse(structuredClone(once) as never), name).toEqual(once);
    }
  });

  it("accepts the fixed flags a parser writes, but only with their fixed value", () => {
    const parsed = parseSceneIlluminationProfile(illuminationProfile);
    expect(parsed.sceneRadianceCalculated).toBe(false);
    expect(parseSceneIlluminationProfile(parsed)).toEqual(parsed);
    expect(() => parseSceneIlluminationProfile({ ...parsed, sceneRadianceCalculated: true }))
      .toThrow(new InvalidConfigurationError("sceneIlluminationProfile.sceneRadianceCalculated must be false when supplied."));
  });

  it("parses a serialized simulated capture again", () => {
    const capture = createSimulatedCapture(loadLinearCaptureInput()).value;
    expect(parseSimulatedCapture(JSON.parse(serializeSimulatedCapture({ capture })))).toEqual(capture);
  });
});

describe("record-taking functions are strict at every level (2.0.0)", () => {
  const readout = { physicalChargeCapacityElectrons: 20000, preAdcSaturationElectronEquivalent: 30000,
    systemConversionGainElectronsPerCode: 1, blackLevelCode: 512, digitalSaturationCode: 65535,
    integralNonLinearity: { kind: "piecewise-linear-code-offset" as const, knots: [{ code: 0, offsetCodes: 0 }, { code: 40000, offsetCodes: -20 }] } };

  it("calculateEffectiveSaturationCode accepts a readout or a whole raw code sample, and nothing else", () => {
    expectStrictAtEveryLevel(calculateEffectiveSaturationCode, readout);
    expect(() => calculateEffectiveSaturationCode({ ...readout, digitalGainPercent: 100 } as never))
      .toThrow(new InvalidConfigurationError('calculateEffectiveSaturationCode input has unknown field "digitalGainPercent".'));
    // Fields of a SensorRawCodeSample are known fields, so a real sample is accepted unchanged.
    expect(calculateEffectiveSaturationCode({ ...readout, rawCode: 100, channelId: "green", bloomingModeled: false } as never))
      .toBe(calculateEffectiveSaturationCode(readout));
  });

  it("validateCalculationQuality and prepareColorMatchingFunctions reject unknown fields at every level", () => {
    expectStrictAtEveryLevel(validateCalculationQuality, {
      uncertainty: [{ kind: "relative", quantityPath: "value", source: "model-approximation", fraction: 0.1,
        confidence: { level: 0.95, basis: "Synthetic." } }],
      validRanges: [{ parameterPath: "x", unit: "mm", minimum: 0 }]
    });
    expectStrictAtEveryLevel(prepareColorMatchingFunctions, {
      kind: "tabulated", observer: "caller-defined", datasetId: "synthetic",
      samples: [{ wavelengthNanometers: 400, xBar: 0, yBar: 0, zBar: 0 }, { wavelengthNanometers: 700, xBar: 1, yBar: 1, zBar: 1 }]
    });
  });
});
