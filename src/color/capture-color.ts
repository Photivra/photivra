// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Returns the versioned ideal camera basis, independent of rendering/serializer state.
 * Validates the entire capture and explicit transform policy across untrusted JSON boundaries.
 * @see docs/CAPTURE_COLOR.md for equations, coordinate/unit conventions, blockers and support limits.
 */

import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { calculatedResult, approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { InvalidScientificResultError } from "../core/validation.js";
import { parseSimulatedCapture, type SimulatedCapture, type CaptureLinearPlane, type CapturePublicProfileReference } from "../capture/simulated-capture.js";

export const CAPTURE_COLOR_MODEL_VERSION = "0.1.0" as const;
/** Explicit ideal colorimetric camera, not measured spectral sensor channels. */
export const VIRTUAL_COLOR_CAMERA_PROFILE = Object.freeze({ id: "photivra-colorimetric-rgb-d65", version: CAPTURE_COLOR_MODEL_VERSION });
/** Linear light, sRGB primaries/D65; no sRGB transfer curve is applied. */
export const LINEAR_CAPTURE_RGB_PROFILE = Object.freeze({ id: "linear-srgb-d65", version: CAPTURE_COLOR_MODEL_VERSION });
const D65 = Object.freeze({ x: .3127/.3290, y: 1 as const, z: (1-.3127-.3290)/.3290 });
type Vector = readonly [number, number, number];
type Matrix = readonly [Vector, Vector, Vector];
const IDENTITY: Matrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
function multiply(m: Matrix, v: Vector): Vector {
  return m.map((r) => r[0]*v[0]+r[1]*v[1]+r[2]*v[2]) as unknown as Vector;
}
function inverse(m: Matrix): Matrix {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const determinant = a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  return [[e*i-f*h, c*h-b*i, b*f-c*e], [f*g-d*i, a*i-c*g, c*d-a*f], [d*h-e*g, b*g-a*h, a*e-b*d]]
    .map((r) => r.map((v) => v/determinant)) as unknown as Matrix;
}
// Independently derive the basis from public primary chromaticities, not a copied matrix.
const primaries: readonly (readonly [number, number])[] = [[.64, .33], [.30, .60], [.15, .06]];
const columns = primaries.map(([x, y]): Vector => [x/y, 1, (1-x-y)/y]);
const basis = [0, 1, 2].map((i) => columns.map((c) => c[i]!)) as unknown as Matrix;
const scales = multiply(inverse(basis), [D65.x, 1, D65.z]);
const RGB_TO_XYZ = basis.map((row) => row.map((v, i) => v*scales[i]!)) as unknown as Matrix;
const XYZ_TO_RGB = inverse(RGB_TO_XYZ);

/** One explicit color interpretation; gains and adaptation cannot silently double-apply WB. */
export type CaptureColorWhiteBalance =
  | { kind: "preserve-intent" }
  | { kind: "apply-resolved-rgb-gains"; channelBasis: CapturePublicProfileReference }
  | { kind: "adopted-white-xyz-scaling" };
/** IDs identify a new derived plane; source capture stays immutable. */
export interface CaptureColorTransformInput {
  capture: SimulatedCapture;
  sourcePlaneId: string;
  outputPlaneId: string;
  outputImageStateId: string;
  whiteBalance: CaptureColorWhiteBalance;
}
/** Profile data exposes complete row-major matrices and domain conditions to consumers. */
export interface CaptureColorModel {
  version: typeof CAPTURE_COLOR_MODEL_VERSION;
  cameraProfile: CapturePublicProfileReference;
  outputProfile: CapturePublicProfileReference;
  referenceIlluminant: "D65";
  observer: "cie-1931-2-degree";
  referenceWhiteXyz: { x: number; y: 1; z: number };
  cameraRgbToXyz: Matrix;
  xyzToCameraRgb: Matrix;
  scientificStatus: "calculated";
  validConditions: readonly string[];
  publicEvidenceIds: readonly string[];
}
/** Returns the versioned ideal camera basis, independent of rendering/serializer state. */
export function resolveCaptureColorModel(): CaptureColorModel {
  return { version: CAPTURE_COLOR_MODEL_VERSION, cameraProfile: { ...VIRTUAL_COLOR_CAMERA_PROFILE },
    outputProfile: { ...LINEAR_CAPTURE_RGB_PROFILE }, referenceIlluminant: "D65", observer: "cie-1931-2-degree",
    referenceWhiteXyz: { ...D65 }, cameraRgbToXyz: RGB_TO_XYZ.map((r) => [...r]) as unknown as Matrix,
    xyzToCameraRgb: XYZ_TO_RGB.map((r) => [...r]) as unknown as Matrix, scientificStatus: "calculated",
    validConditions: ["Ideal colorimetric basis only; virtual RGB is an invertible encoding of CIE XYZ",
      "Not spectral channels, electrons, commercial-camera RGB or a sensor calibration",
      "Signed finite scene-linear values; co-sited RGB; no transfer curve, gamut mapping or clipping"],
    publicEvidenceIds: ["w3c:css-color-4:srgb-primaries-d65"] };
}
function record(v: unknown, keys: readonly string[]): Record<string, unknown> {
  return requireAllowlistedRecord(v, keys, "Invalid color-transform fields.");
}
function publicId(v: unknown): string {
  return requirePublicOpaqueId(v, "Invalid public color ID.");
}
/** Validates the entire capture and explicit transform policy across untrusted JSON boundaries. */
export function parseCaptureColorTransformInput(value: unknown): CaptureColorTransformInput {
  const r = record(value, ["capture", "sourcePlaneId", "outputPlaneId", "outputImageStateId", "whiteBalance"]);
  const w = record(r.whiteBalance, ["kind", "channelBasis"]);
  let whiteBalance: CaptureColorWhiteBalance;
  if (w.kind === "apply-resolved-rgb-gains") {
    const p = record(w.channelBasis, ["id", "version"]);
    whiteBalance = { kind: w.kind, channelBasis: { id: publicId(p.id), version: publicId(p.version) } };
  } else if ((w.kind === "preserve-intent" || w.kind === "adopted-white-xyz-scaling") && w.channelBasis === undefined) {
    whiteBalance = { kind: w.kind };
  } else throw new InvalidConfigurationError("Unsupported or contradictory color WB policy.");
  return { capture: parseSimulatedCapture(r.capture), sourcePlaneId: publicId(r.sourcePlaneId),
    outputPlaneId: publicId(r.outputPlaneId), outputImageStateId: publicId(r.outputImageStateId), whiteBalance };
}
export interface CaptureColorTransformResult {
  plane: CaptureLinearPlane;
  colorModel: CaptureColorModel;
  sourcePlaneId: string;
  sourceImageStateId: string;
  whiteBalance: CaptureColorWhiteBalance;
  /** Matrix on CIE XYZ, identity when no adaptation; row-major, dimensionless. */
  chromaticAdaptationMatrix: Matrix;
  /** False: even adopted-white scaling is a camera choice under mixed illumination. */
  claimsUniqueSceneWhite: false;
}
/**
 * Converts a bounded inline XYZ/ideal-camera plane to unclamped linear sRGB.
 * Reuses resolved WB intent; never estimates illumination or changes exposure/noise.
 * XYZ diagonal adaptation is explicitly an approximation, distinct from RGB gains.
 */
export function calculateCaptureColorTransform(input: CaptureColorTransformInput): CalculationResult<CaptureColorTransformResult> {
  const { capture, sourcePlaneId, outputPlaneId, outputImageStateId, whiteBalance } = parseCaptureColorTransformInput(input);
  const source = capture.planes.find((p) => p.id === sourcePlaneId);
  if (!source || source.storage.kind !== "inline-float64" || source.imageState === "color-transformed-linear-rgb" ||
      source.whiteBalanceApplication === "applied-rgb-gains" || source.whiteBalanceApplication === "applied-chromatic-adaptation" ||
      source.appliedTransforms.some((t) => t.kind !== "digital-lens-correction")) {
    throw new InvalidConfigurationError("Color requires an untreated inline XYZ or supported virtual camera plane.");
  }
  if (capture.planes.some((p) => p.id === outputPlaneId || p.imageStateId === outputImageStateId)) {
    throw new InvalidConfigurationError("Derived color plane/state IDs must be new.");
  }
  const virtual = source.imageState === "virtual-sensor-channels";
  if (virtual && (source.colorProfile?.id !== VIRTUAL_COLOR_CAMERA_PROFILE.id || source.colorProfile.version !== CAPTURE_COLOR_MODEL_VERSION ||
      JSON.stringify(source.channelIds) !== JSON.stringify(["red", "green", "blue"]))) {
    throw new InvalidConfigurationError("Unresolved spectral/sensor RGB cannot use the ideal colorimetric transform.");
  }
  const adapt = whiteBalance.kind === "adopted-white-xyz-scaling";
  const reference = source.encodingReferenceWhiteXyz;
  if (!virtual && !adapt && (reference!.x !== D65.x || reference!.z !== D65.z)) {
    throw new InvalidConfigurationError("A different XYZ reference white requires an explicit adaptation choice.");
  }
  const gains = whiteBalance.kind === "apply-resolved-rgb-gains";
  if (gains && (!capture.whiteBalanceIntent || whiteBalance.channelBasis.id !== VIRTUAL_COLOR_CAMERA_PROFILE.id ||
      whiteBalance.channelBasis.version !== CAPTURE_COLOR_MODEL_VERSION)) {
    throw new InvalidConfigurationError("Resolved WB gains require an explicit matching camera channel-basis binding.");
  }
  let adaptation: Matrix = IDENTITY;
  if (adapt) {
    const white = capture.adoptedWhiteXyz;
    if (!white) throw new InvalidConfigurationError("Adopted-white adaptation requires an explicit adopted XYZ white.");
    const x = D65.x/white.x, z = D65.z/white.z;
    if (!Number.isFinite(x) || !Number.isFinite(z) || x < 1e-6 || x > 1e6 || z < 1e-6 || z > 1e6) {
      throw new InvalidConfigurationError("Adopted-white scaling is outside the declared numerical domain.");
    }
    adaptation = [[x, 0, 0], [0, 1, 0], [0, 0, z]];
  }
  const samples: number[] = [], values = source.storage.samples;
  for (let i = 0; i < values.length; i += 3) {
    const v: Vector = [values[i]!, values[i+1]!, values[i+2]!];
    let rgb = virtual && !adapt ? v : multiply(XYZ_TO_RGB, multiply(adaptation, virtual ? multiply(RGB_TO_XYZ, v) : v));
    if (gains) {
      const g = capture.whiteBalanceIntent!.channelGains;
      rgb = [rgb[0]*g.red, rgb[1]*g.green, rgb[2]*g.blue];
    }
    if (rgb.some((v) => !Number.isFinite(v))) throw new InvalidScientificResultError("Color transform produced a non-finite sample.");
    samples.push(...rgb.map((v) => Object.is(v, -0) ? 0 : v));
  }
  const transforms: CaptureLinearPlane["appliedTransforms"][number][] = [...source.appliedTransforms];
  if (adapt) transforms.push({ profile: { id: "photivra-xyz-diagonal-adaptation", version: CAPTURE_COLOR_MODEL_VERSION }, kind: "chromatic-adaptation" });
  transforms.push({ profile: { ...LINEAR_CAPTURE_RGB_PROFILE }, kind: "linear-color" });
  if (gains) transforms.push({ profile: { id: capture.whiteBalanceIntent!.stateId, version: CAPTURE_COLOR_MODEL_VERSION }, kind: "linear-color" });
  const plane: CaptureLinearPlane = { ...source, id: outputPlaneId, imageStateId: outputImageStateId,
    imageState: "color-transformed-linear-rgb", channelIds: ["red", "green", "blue"], colorProfile: { ...LINEAR_CAPTURE_RGB_PROFILE },
    encodingReferenceWhiteXyz: { ...D65 }, appliedTransforms: transforms,
    whiteBalanceApplication: gains ? "applied-rgb-gains" : adapt ? "applied-chromatic-adaptation" : capture.whiteBalanceIntent ? "intent-only" : "not-applicable",
    storage: { kind: "inline-float64", samples } };
  // Validation enforces capture-wide sample budget, identities and output finiteness.
  const checked = parseSimulatedCapture({ ...capture, planes: [plane] }).planes[0]!;
  const result: CaptureColorTransformResult = { plane: checked, colorModel: resolveCaptureColorModel(), sourcePlaneId,
    sourceImageStateId: source.imageStateId, whiteBalance, chromaticAdaptationMatrix: adaptation.map((r) => [...r]) as unknown as Matrix,
    claimsUniqueSceneWhite: false };
  const assumptions = ["Ideal CIE colorimetric virtual camera only; no sensor calibration inferred", "Source exposure/noise/saturation history retained; float samples never clipped",
    "WB intent, applied RGB gains and adopted-white adaptation are independent choices; no scene-white oracle"];
  return adapt ? approximationResult(result, "capture-color-xyz-diagonal-adaptation", CAPTURE_COLOR_MODEL_VERSION,
    [...assumptions, "XYZ diagonal scaling is a limited chromatic-adaptation approximation, not Bradford or a color-appearance model"])
    : calculatedResult(result, "capture-colorimetric-linear-rgb", CAPTURE_COLOR_MODEL_VERSION, assumptions);
}
