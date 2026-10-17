// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { evaluateSceneIlluminationTemporalMultiplier, InvalidConfigurationError, InvalidScientificInputError,
  parseSceneIlluminationProfile, parseSceneIlluminationTemporalProfile } from "../src/index.js";
import { expectRejection, type Json, type MixedRejectionCase, type RejectionCase } from "./helpers/rejection-table.js";

const evidence = [{ sourceOrigin: "photivra", sourceReference: "test:temporal-rejections", reuseStatus: "photivra-owned" }];

function base(): Json {
  return {
    schemaVersion: "0.1.0", profileId: "temporal", sceneId: "room", illuminationProfileId: "lights", evidence,
    waveforms: [
      { waveformId: "pulse", kind: "aperiodic-relative-multiplier", timeUnit: "s", scientificStatus: "calibrated",
        uncertainty: { kind: "relative", fraction: 0.02, basis: "test" }, evidence, interpolation: "piecewise-linear",
        outsideSupportBehavior: "zero", samples: [{ timeSecondsFromWaveformReference: 0, relativeMagnitudeMultiplier: 0 },
          { timeSecondsFromWaveformReference: 0.005, relativeMagnitudeMultiplier: 2 }, { timeSecondsFromWaveformReference: 0.01, relativeMagnitudeMultiplier: 0 }] },
      { waveformId: "flicker", kind: "periodic-relative-multiplier", timeUnit: "s", scientificStatus: "approximation",
        uncertainty: { kind: "not-quantified", limitation: "test" }, evidence, interpolation: "piecewise-linear", periodSeconds: 0.01,
        endpointContinuityRequired: true, samples: [{ timeSecondsFromWaveformReference: 0, relativeMagnitudeMultiplier: 1 },
          { timeSecondsFromWaveformReference: 0.005, relativeMagnitudeMultiplier: 0 }, { timeSecondsFromWaveformReference: 0.01, relativeMagnitudeMultiplier: 1 }] }
    ],
    sourceBindings: [{ bindingId: "flash-binding", sourceId: "flash", waveformId: "pulse", captureTimeReference: "first-opening-boundary-phase",
      waveformTimeZeroSecondsFromCaptureReference: 0, scientificStatus: "calibrated",
      timingUncertainty: { kind: "absolute-seconds", plusMinusSeconds: 0.0001, basis: "test" }, evidence }],
    baseIlluminationProfileRemainsAuthoritative: true, sensorReadoutTimingUsedAsExposureTiming: false, automaticExposurePolicyIncluded: false
  };
}

const parseCases: RejectionCase[] = [
  ["a non-object waveform", (p): void => { p.waveforms[0] = null; }, "waveforms[0] must be an object."],
  ["a blank waveformId", (p): void => { p.waveforms[0].waveformId = ""; }, ".waveformId must be a non-empty string."],
  ["a non-finite multiplier", (p): void => { p.waveforms[0].samples[1].relativeMagnitudeMultiplier = Number.NaN; }, " must be finite."],
  ["a zero period", (p): void => { p.waveforms[1].periodSeconds = 0; }, ".periodSeconds must be greater than zero."],
  ["a negative timing uncertainty", (p): void => { p.sourceBindings[0].timingUncertainty.plusMinusSeconds = -1; },
    " must be greater than or equal to zero."],
  ["an unknown scientific status", (p): void => { p.waveforms[0].scientificStatus = "measured"; }, ".scientificStatus is invalid."],
  ["an unknown waveform uncertainty kind", (p): void => { p.waveforms[0].uncertainty = { kind: "absolute" }; }, ".uncertainty.kind is invalid."],
  ["an unknown timing uncertainty kind", (p): void => { p.sourceBindings[0].timingUncertainty = { kind: "relative" }; }, ".timingUncertainty.kind is invalid."],
  ["a single-sample waveform", (p): void => { p.waveforms[0].samples = [p.waveforms[0].samples[0]]; }, ".samples must contain at least two samples."],
  ["non-increasing sample times", (p): void => { p.waveforms[0].samples[2].timeSecondsFromWaveformReference = 0.005; }, " times must be strictly increasing."],
  ["a millisecond time unit", (p): void => { p.waveforms[0].timeUnit = "ms"; }, '.timeUnit must be "s".'],
  ["step interpolation", (p): void => { p.waveforms[0].interpolation = "step"; }, '.interpolation must be "piecewise-linear".'],
  ["hold-last outside support", (p): void => { p.waveforms[0].outsideSupportBehavior = "hold"; }, '.outsideSupportBehavior must be "zero".'],
  ["a periodic waveform ending before its period", (p): void => { p.waveforms[1].periodSeconds = 0.02; },
    ".samples must end exactly at periodSeconds."],
  ["a periodic waveform without endpoint continuity", (p): void => { p.waveforms[1].endpointContinuityRequired = false; },
    ".endpointContinuityRequired must be true."],
  ["an unknown waveform kind", (p): void => { p.waveforms[0].kind = "random-relative-multiplier"; }, "waveforms[0].kind is invalid."],
  ["a readout-based capture time reference", (p): void => { p.sourceBindings[0].captureTimeReference = "readout-start"; },
    '.captureTimeReference must be "first-opening-boundary-phase".'],
  ["an unsupported schema version", (p): void => { p.schemaVersion = "0.2.0"; }, "sceneIlluminationTemporalProfile.schemaVersion must be"],
  ["non-array waveforms", (p): void => { p.waveforms = {}; }, "sceneIlluminationTemporalProfile.waveforms must be an array."],
  ["non-array source bindings", (p): void => { p.sourceBindings = {}; }, "sceneIlluminationTemporalProfile.sourceBindings must be an array."],
  ["duplicate waveform ids", (p): void => { p.waveforms[1].waveformId = "pulse"; }, "waveformId must not contain duplicates."],
  ["duplicate binding ids", (p): void => { p.sourceBindings.push({ ...p.sourceBindings[0], sourceId: "lamp" }); },
    "bindingId must not contain duplicates."]
];

const illumination = (): ReturnType<typeof parseSceneIlluminationProfile> => parseSceneIlluminationProfile({
  schemaVersion: "0.1.0", profileId: "lights", sceneId: "room", evidence,
  sources: [{ sourceId: "flash", family: "point", enabled: true, geometry: { kind: "point-position", positionM: { x: 0, y: 1, z: 2 } },
    magnitude: { kind: "relative-linear-scale", scale: 1, scientificStatus: "approximation", limitation: "test" },
    spectrum: { kind: "unresolved", limitation: "test" }, temporalBehavior: { kind: "time-invariant" }, evidence }]
});

describe("temporal illumination profile rejection branches", () => {
  it("accepts the valid base profile", () => { expect(parseSceneIlluminationTemporalProfile(base()).waveforms).toHaveLength(2); });
  it.each(parseCases)("rejects %s", (_name, mutate, message) => {
    expectRejection(base, parseSceneIlluminationTemporalProfile, InvalidConfigurationError, mutate, message);
  });

  const evaluationBase = (): Json => ({ illuminationProfile: illumination(), temporalProfile: parseSceneIlluminationTemporalProfile(base()),
    sourceId: "flash", captureTimeSecondsFromReference: 0.0025 });
  const evaluate = (input: Json): unknown => evaluateSceneIlluminationTemporalMultiplier(input);
  it("evaluates the base binding by linear interpolation (0 -> 2 over 5 ms gives 1 at 2.5 ms) and the support end exactly", () => {
    expect(evaluateSceneIlluminationTemporalMultiplier(evaluationBase()).relativeMagnitudeMultiplier).toBeCloseTo(1, 15);
    expect(evaluateSceneIlluminationTemporalMultiplier({ ...evaluationBase(), captureTimeSecondsFromReference: 0.01 })
      .relativeMagnitudeMultiplier).toBe(0);
  });
  it.each([
    ["a blank source id", (i: Json): void => { i.sourceId = " "; }, "sourceId must be a non-empty string.", InvalidConfigurationError],
    ["a mismatched illumination profile id", (i: Json): void => {
      i.temporalProfile = parseSceneIlluminationTemporalProfile({ ...base(), illuminationProfileId: "other" });
    }, "illuminationProfileId must match the supplied illumination profile."],
    ["a binding to an undeclared source", (i: Json): void => {
      const p = base(); p.sourceBindings[0].sourceId = "lamp"; i.temporalProfile = parseSceneIlluminationTemporalProfile(p);
    }, "references a sourceId that is not declared by the illumination profile."],
    ["a binding to an undeclared waveform", (i: Json): void => {
      const p = base(); p.sourceBindings[0].waveformId = "strobe"; i.temporalProfile = { ...parseSceneIlluminationTemporalProfile(base()),
        sourceBindings: p.sourceBindings };
    }, "waveformId is not declared by the temporal profile."]
  ] as MixedRejectionCase[])("evaluation rejects %s", (_name, mutate, message, errorClass) => {
    expectRejection(evaluationBase, evaluate, errorClass ?? InvalidScientificInputError, mutate, message);
  });
});
