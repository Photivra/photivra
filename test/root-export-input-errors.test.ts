// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import * as engine from "../src/index.js";
import {
  InvalidConfigurationError,
  InvalidScientificInputError,
  InvalidScientificResultError
} from "../src/index.js";

/** Domain error classes a caller can handle; anything else escaping a root function is a defect. */
function isDomainError(error: unknown): boolean {
  return error instanceof InvalidConfigurationError ||
    error instanceof InvalidScientificInputError ||
    error instanceof InvalidScientificResultError;
}

const MALFORMED_INPUTS: readonly [string, unknown][] = [
  ["null", null], ["undefined", undefined], ["{}", {}], ["42", 42], ["\"x\"", "x"], ["[]", []]
];

const rootFunctions = Object.entries(engine)
  .filter((entry): entry is [string, (...args: unknown[]) => unknown] => typeof entry[1] === "function")
  // Exported error classes are constructors, not calculations.
  .filter(([, value]) => !/^class\b/u.test(Function.prototype.toString.call(value)));

describe("root exports reject malformed input with domain errors (API review #4)", () => {
  it("covers every root function", () => {
    expect(rootFunctions.length).toBeGreaterThan(250);
  });

  it("never lets a raw TypeError or RangeError escape for null, undefined, {}, 42, \"x\" or []", async () => {
    const escaped: string[] = [];
    for (const [name, fn] of rootFunctions) {
      for (const [label, input] of MALFORMED_INPUTS) {
        try {
          const result = fn(input);
          if (result instanceof Promise) await result;
        } catch (error) {
          if (!isDomainError(error)) {
            escaped.push(`${name}(${label}): ${error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error)}`);
          }
        }
      }
    }
    expect(escaped).toEqual([]);
  });

  it("rejects unknown fields on the simple scalar calculators", () => {
    const strict = ["calculateEquivalentFocalLength35Mm", "calculateFieldOfView", "calculateFieldOfViewBounds", "calculateProjectedObjectSize",
      "calculateDepthOfField", "calculateDefocusCircle", "estimateEquivalentViewingCircleOfConfusion", "calculateAiryDisk",
      "calculateExposureValue100", "calculateRelativeOpticalExposure", "calculateRelativeRenderedExposure", "calculateEquivalentIso",
      "calculateThinLensImageDistance", "calculateIdealApertureGeometry", "calculatePixelPitch", "calculatePlanckianSpectralRadiance",
      "estimatePlanckianLocusChromaticity", "prepareBt1886Eotf",
      "calculateSignalToNoise", "calculateProjectedMotionBlur"] as const;
    for (const name of strict) {
      const fn = engine[name] as (input: unknown) => unknown;
      expect(() => fn({ unexpectedField: 1 }), name).toThrow(new InvalidConfigurationError(`${name} input has unknown field "unexpectedField".`));
    }
  });

  it("rejects a misspelled or wrong-unit field next to valid fields (2.0.0: every calculator is strict)", () => {
    const cases: readonly [string, () => unknown, string][] = [
      ["calculateSignalToNoise", (): unknown => engine.calculateSignalToNoise({ signalElectrons: 100, readNoiseElectrons: 2,
        darkCurrentElectrons: 5 } as never), "darkCurrentElectrons"],
      ["calculateProjectedMotionBlur", (): unknown => engine.calculateProjectedMotionBlur({ focalLengthMm: 50, shutterSeconds: 1 / 100,
        positionM: { x: 0, y: 0, z: 10 }, velocityMps: { x: 1, y: 0, z: 0 }, focusDistanceMm: 10_000 } as never), "focusDistanceMm"],
      ["calculatePhotoelectrons", (): unknown => engine.calculatePhotoelectrons({ incidentPhotons: 100, quantumEfficiency: 0.5,
        quantumEfficiencyPercent: 50 } as never), "quantumEfficiencyPercent"],
      ["estimateCameraShakeBlur", (): unknown => engine.estimateCameraShakeBlur({ focalLengthMm: 50, shutterSeconds: 1 / 30,
        angularVelocityRadPerSec: { yaw: 0.01, pitch: 0 }, stabilizationStopsEquivalent: 0, pixelPitchMm: 0.004 } as never), "pixelPitchMm"],
      ["calculateCenteredCrop", (): unknown => engine.calculateCenteredCrop({ pixelWidth: 6000, pixelHeight: 4000, cropFactor: 1.5,
        cropFactorPercent: 150 } as never), "cropFactorPercent"]
    ];
    for (const [name, call, field] of cases) {
      expect(call, name).toThrow(new InvalidConfigurationError(`${name} input has unknown field ${JSON.stringify(field)}.`));
    }
    // The same calls without the extra field still succeed, so the extra field alone causes the rejection.
    expect(engine.calculateSignalToNoise({ signalElectrons: 100, readNoiseElectrons: 2 }).value.snrLinear).toBeCloseTo(100 / Math.sqrt(104), 12);
    expect(engine.calculateProjectedMotionBlur({ focalLengthMm: 50, shutterSeconds: 1 / 100, positionM: { x: 0, y: 0, z: 10 },
      velocityMps: { x: 1, y: 0, z: 0 } }).value.distanceMm).toBeGreaterThan(0);
  });

  /*
   * Every root function is classified. Functions that take an input object must reject an unknown
   * field. Most use the shared message "<name> input has unknown field ...". The others are listed
   * below with the reason, so a new root export must be classified here before it ships.
   */
  const STRICT_WITH_DOMAIN_MESSAGE = new Set([
    // Reject unknown fields through their own allowlist parser, with a domain message.
    "calculateCaptureColorTransform", "calculateCaptureCorrectedSdr", "calculateCaptureSdr", "calculateIdealPolygonDiffractionPsf",
    "calculateIrradianceConvolution", "calculateIrradianceConvolutionPlan", "calculatePackedSensorRawPlan", "calculateTemporalExposureSum",
    "calculateTemporalExposureSumPlan", "calculateLinearCaptureEncoding", "calculateNativeCaptureSdrPlan",
    "calculateNativeRawPlan", "calculatePrintContrastReference", "calculatePrintPlan", "calculatePrintRegionDetail",
    "calculatePrintRegionDifference", "calculatePrintRegionNoise", "calculatePrintSizeLimit", "calculateProcessedSensorRaw",
    "calculateSdrRendering", "createAhdDemosaicTask", "createBilateralFilterTask", "createCaptureExportMetadataPair",
    "createCfaPlaneReconstructionTask", "createDurandDorseyToneMappingTask", "createExposureFusionTask", "createFocusStackTask",
    "createGenericEquipmentTierSelection", "createHdrBracketMergeTask", "createHdrImageEncodingTask", "createImageKernelAccelerator",
    "createIsoGainReadoutRegimes", "createNativeCaptureSdrTask", "createNativeEnvironmentRawPartitionTask", "createNativeEnvironmentRawTask", "createNativeEnvironmentSensorStageTask",
    "createNativeRawDevelopmentTask", "createNativeRawTask", "composeNativeEnvironmentRawPartitions", "createNonLocalMeansTask", "createPanoramaTask", "createPhotographicExportPair",
    "createPrintJpegTask", "createReinhardGlobalToneMappingTask", "createSensorRawFrame", "createSimulatedCapture",
    "createSyntheticFilmGrainTask", "createUnsharpMaskTask", "resolveCaptureIlluminant", "resolveGenericEquipmentTierCatalog",
    "resolveGenericEquipmentTierLensProfiles", "resolveRawFrameReconstruction", "serializeNativeRawDng", "serializePngImage",
    "simulateCapture", "simulatePackedSensorRaw", "simulateSensorRawFrame"
  ]);
  const NO_INPUT_OBJECT = new Set([
    // Positional scalars or bound objects, a string id, raw bytes, result factories or no argument at all.
    "approximationResult", "composeRelativeErrorBounds", "assessShutterAngleRule", "calculateCieIlluminantARelativeSpectralPower", "calculateHighlightPriorityPlacementSignal",
    "calculateShutterAngleExposureSeconds", "calculateShutterAngleFromExposureSeconds", "calculatedResult", "calibratedResult",
    "createCieIlluminantASpectrum", "createSrgbIccProfile", "estimateCie1931ColorMatchingFunctions", "estimatedResult",
    "evaluateBt709InverseOetf", "evaluateBt709Oetf", "evaluateHlgInverseOetf", "evaluateHlgOetf", "evaluatePqEotf", "evaluatePqInverseEotf",
    "evaluateSrgbDecoding", "evaluateSrgbEncoding", "evaluateZernikePolynomial", "getImageFormationContract", "getPsfFoundationContract",
    "resolveCaptureColorModel", "resolveChromaticAdaptationConeMatrix", "resolveRgbColorSpace", "resolveZernikeNollOrder",
    // Parsers of a string, an array or raw bytes rather than a record.
    "parseColorimetricQuadratureNodes", "parseLensProjectionModel", "parseLosslessJpeg", "parseSpectralWavelengthBasis"
  ]);
  /*
   * 2.0.0: the parse*() record parsers and the functions that take a whole engine or versioned record
   * are strict too. They name the path of the record and the field, for example
   * `sceneIlluminationProfile has unknown field "unexpectedField".` (or, where an existing domain
   * message is kept, `<message> Unknown field "unexpectedField".`).
   */
  const RECORD_FUNCTIONS = new Set([
    "assessMtfOnlyPsfRenderability", "assessRadiometryReadiness", "assessSceneMaterialResponseFidelity",
    "calculateNativeRawRowBands", "createRollingShutterCaptureExposureSchedule", "createTtlScaledFlashProfile", "integrateDiscreteSpectralLineMeasure",
    "prepareColorMatchingFunctions", "prepareColorimetricSpectrum", "resolveAntiAliasingSpatialKernel",
    "resolveSceneIlluminationDiscreteLineMeasure", "serializeProductionImageFormationPlan", "validateCalculationQuality"
  ]);
  const namesUnknownField = (message: string | undefined): boolean => /unknown field "unexpectedField"/iu.test(message ?? "");

  it("classifies every root function, and every input-object function outside the lists rejects unknown fields", async () => {
    const unclassified: string[] = [];
    const misclassified: string[] = [];
    const lenientRecords: string[] = [];
    for (const [name, fn] of rootFunctions) {
      let message: string | undefined;
      let isConfiguration = false;
      try {
        const result = fn({ unexpectedField: 1 });
        if (result instanceof Promise) await result;
      } catch (error) {
        isConfiguration = error instanceof InvalidConfigurationError;
        message = error instanceof Error ? error.message : undefined;
      }
      const shared = isConfiguration && message === `${name} input has unknown field "unexpectedField".`;
      const takesRecord = (name.startsWith("parse") || RECORD_FUNCTIONS.has(name)) && !NO_INPUT_OBJECT.has(name);
      const listed = STRICT_WITH_DOMAIN_MESSAGE.has(name) || NO_INPUT_OBJECT.has(name) || RECORD_FUNCTIONS.has(name);
      if (takesRecord && !(isConfiguration && namesUnknownField(message))) lenientRecords.push(`${name}: ${message ?? "no error"}`);
      if (shared && listed) misclassified.push(name);
      if (!shared && !listed && !takesRecord) unclassified.push(`${name}: ${message ?? "no error"}`);
    }
    expect(unclassified).toEqual([]);
    expect(misclassified).toEqual([]);
    expect(lenientRecords).toEqual([]);
  });
});
