// SPDX-License-Identifier: Apache-2.0

/**
 * Turns a facade scene (an engine chart, a caller reflectance function or a caller radiance function) and
 * an illuminant into a scene radiance provider for the existing native environment RAW contract
 * (`NativeEnvironmentRawProvider.evaluateRadiance` and, for pupil sampling, `evaluateApertureRadiance`).
 *
 * Geometry: one plane perpendicular to the optical axis at `distanceM` in front of the camera. A query's
 * outgoing direction o (scene toward camera, see docs/SENSOR_ENVIRONMENT_QUERY.md) gives the look
 * direction l = -o; the plane point is l·distanceM/l.z. With a pupil ray, the plane point is the ray from
 * its lens origin to z = distanceM.
 *
 * Radiometry: a Lambertian reflector of reflectance ρ(λ) under irradiance E(λ) has radiance
 * L(λ) = ρ(λ)·E(λ)/π (W·m⁻²·sr⁻¹·nm⁻¹). The illuminant spectral shape S(λ) is scaled so that the
 * plane illuminance is E_v = K_m ∫ E(λ) V(λ) dλ with K_m = 683 lm/W (CIE photometric definition) and
 * V(λ) = ȳ(λ) from the engine's analytic CIE 1931 fit (Wyman, Sloan & Shirley 2013). The illuminant is
 * uniform over the plane and arrives without shadowing; inter-reflection, gloss and fluorescence are not modelled.
 * @see docs/QUICK_START.md
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireInputObject } from "../core/record-validation.js";
import { estimateCie1931ColorMatchingFunctions, prepareColorimetricSpectrum, type ColorimetricSpectrum,
  type PreparedColorimetricSpectrum } from "../color/color-matching-functions.js";
import { createCieIlluminantASpectrum, createCieDaylightSpectrum, createPlanckianSpectrum, type CieDaylightBasis } from "../color/illuminants.js";
import type { SceneRadianceEvaluationRequest, SceneRadianceEvaluationResult } from "../schema/scene-radiance.js";
import type { EvidenceProvenance } from "../core/evidence-provenance.js";
import type { SensorApertureRay } from "../optics/sensor-aperture-rays.js";
import { resolveChartScene, type ChartScene, type ResolvedChartScene } from "./chart-scenes.js";

/** CIE maximum luminous efficacy for photopic vision, lm/W. */
export const PHOTOPIC_MAXIMUM_LUMINOUS_EFFICACY_LM_PER_W = 683;
/** Wavelength range of every facade spectrum and of the facade sensor quadrature, nm. */
export const FACADE_SPECTRAL_RANGE_NANOMETERS = Object.freeze({ minimum: 380, maximum: 780 });

/**
 * Illuminant choices. CIE D65 is not bundled: its S0/S1/S2 basis tables must come from the caller
 * (`daylight`). `planckian` is Planck's law; `cie-a` is CIE illuminant A from its defining formula.
 */
export type CaptureIlluminant =
  | "cie-a"
  | { kind: "planckian"; temperatureKelvin: number }
  | { kind: "cie-a" }
  | { kind: "daylight"; correlatedColorTemperatureKelvin: number; basis: CieDaylightBasis }
  | { kind: "spectrum"; spectrum: ColorimetricSpectrum; label?: string };

export interface ResolvedCaptureIlluminant {
  /** Short public description, for example "planckian-6500K". */
  id: string;
  description: string;
  /** Relative spectral shape (arbitrary scale) over at least 380-780 nm. */
  shape: PreparedColorimetricSpectrum;
  /** Original spectrum, for colorimetric white-balance calculations. */
  spectrum: ColorimetricSpectrum;
}

export function resolveCaptureIlluminant(value: CaptureIlluminant): ResolvedCaptureIlluminant {
  if (value === "cie-a") return resolveCaptureIlluminant({ kind: "cie-a" });
  requireInputObject(value, "illuminant");
  const record = value as unknown as Record<string, unknown>;
  const allowed: Record<string, readonly string[]> = { planckian: ["kind", "temperatureKelvin"], "cie-a": ["kind"],
    daylight: ["kind", "correlatedColorTemperatureKelvin", "basis"], spectrum: ["kind", "spectrum", "label"] };
  const keys = typeof record.kind === "string" ? allowed[record.kind] : undefined;
  if (!keys) throw new InvalidConfigurationError("Unknown illuminant kind.");
  for (const key of Object.keys(record)) if (!keys.includes(key)) throw new InvalidConfigurationError("Unknown illuminant field: " + key + ".");
  let spectrum: ColorimetricSpectrum, id: string, description: string;
  try {
    switch (value.kind) {
      case "planckian": {
        const t = value.temperatureKelvin;
        if (typeof t !== "number" || !Number.isFinite(t) || t < 1000 || t > 25000) throw new InvalidConfigurationError("Planckian temperature must be 1000-25000 K.");
        spectrum = createPlanckianSpectrum({ temperatureKelvin: t, wavelengthRangeNanometers: { ...FACADE_SPECTRAL_RANGE_NANOMETERS } });
        id = "planckian-" + t + "K"; description = "Planck blackbody spectrum at " + t + " K (Planck's law).";
        break;
      }
      case "cie-a":
        spectrum = createCieIlluminantASpectrum(); id = "cie-a"; description = "CIE standard illuminant A from its defining formula (CIE 15).";
        break;
      case "daylight":
        spectrum = createCieDaylightSpectrum({ correlatedColorTemperatureKelvin: value.correlatedColorTemperatureKelvin, coefficientRounding: "cie-three-decimals", basis: value.basis });
        id = "cie-daylight-" + value.correlatedColorTemperatureKelvin + "K"; description = "CIE daylight from the caller's S0/S1/S2 basis (" + value.basis.datasetId + ").";
        break;
      case "spectrum":
        spectrum = value.spectrum; id = "caller-spectrum";
        description = "Caller illuminant spectrum" + (typeof value.label === "string" ? " (" + value.label + ")" : "") + ".";
        break;
    }
  } catch (error) {
    if (error instanceof InvalidConfigurationError) throw error;
    throw new InvalidConfigurationError("Invalid illuminant: " + (error instanceof Error ? error.message : "invalid"));
  }
  let shape: PreparedColorimetricSpectrum;
  try { shape = prepareColorimetricSpectrum(spectrum, "illuminant"); } catch (error) {
    throw new InvalidConfigurationError("Invalid illuminant spectrum: " + (error instanceof Error ? error.message : "invalid"));
  }
  const range = shape.wavelengthRangeNanometers;
  if (range.minimum > FACADE_SPECTRAL_RANGE_NANOMETERS.minimum || range.maximum < FACADE_SPECTRAL_RANGE_NANOMETERS.maximum)
    throw new InvalidConfigurationError("The illuminant spectrum must cover 380-780 nm.");
  for (let nm = FACADE_SPECTRAL_RANGE_NANOMETERS.minimum; nm <= FACADE_SPECTRAL_RANGE_NANOMETERS.maximum; nm += 1) {
    const s = shape.evaluate(nm);
    if (!(s >= 0)) throw new InvalidConfigurationError("The illuminant spectrum must be non-negative over 380-780 nm.");
  }
  return Object.freeze({ id, description, shape, spectrum });
}

/**
 * Factor k such that k·S(λ) (W·m⁻²·nm⁻¹) gives `illuminanceLux` on the plane: E_v = 683 ∫ k S ȳ dλ,
 * integrated with the 1 nm trapezoid rule over 380-780 nm (ȳ outside this range is below 4e-5 of its peak).
 */
export function calculateIlluminantIrradianceScale(shape: PreparedColorimetricSpectrum, illuminanceLux: number): number {
  if (typeof shape !== "object" || shape === null || typeof shape.evaluate !== "function") throw new InvalidConfigurationError("A prepared illuminant spectrum is required.");
  if (typeof illuminanceLux !== "number" || !Number.isFinite(illuminanceLux) || illuminanceLux <= 0 || illuminanceLux > 1e7)
    throw new InvalidConfigurationError("Illuminance must be a positive number of lux up to 1e7.");
  let sum = 0;
  for (let nm = FACADE_SPECTRAL_RANGE_NANOMETERS.minimum; nm <= FACADE_SPECTRAL_RANGE_NANOMETERS.maximum; nm++) {
    const w = nm === FACADE_SPECTRAL_RANGE_NANOMETERS.minimum || nm === FACADE_SPECTRAL_RANGE_NANOMETERS.maximum ? 0.5 : 1;
    sum += w * shape.evaluate(nm) * estimateCie1931ColorMatchingFunctions(nm).y;
  }
  if (!(sum > 0)) throw new InvalidConfigurationError("The illuminant has no luminous power.");
  return illuminanceLux / (PHOTOPIC_MAXIMUM_LUMINOUS_EFFICACY_LM_PER_W * sum);
}

/** A point of the scene plane passed to caller scene functions. */
export interface ScenePlanePoint {
  /** Metres on the plane, from the optical axis: +x right, +y up (as seen from the camera). */
  xM: number;
  yM: number;
  /** The same point in frame units (u = ±1 at the left/right frame edges, v up on the same scale). */
  u: number;
  v: number;
  wavelengthNanometers: number;
}
/** Caller Lambertian reflectance (in [0, 1]) lit by the facade illuminant. */
export interface CallerReflectanceScene { kind: "reflectance-function"; sceneId: string; evaluate(point: Readonly<ScenePlanePoint>): number }
/** Caller absolute spectral radiance in W·m⁻²·sr⁻¹·nm⁻¹; the facade illuminant is not used. */
export interface CallerRadianceScene { kind: "radiance-function"; sceneId: string; evaluate(point: Readonly<ScenePlanePoint>): number }

export interface PlanarSceneGeometry {
  distanceM: number;
  /** Metres per frame unit on the plane (half the framed width). */
  metresPerFrameUnit: number;
}

export interface PlanarSceneRadianceProvider {
  sceneId: string;
  providerProfileId: string;
  evaluateRadiance(request: Readonly<SceneRadianceEvaluationRequest>): SceneRadianceEvaluationResult;
  evaluateApertureRadiance(request: Readonly<SceneRadianceEvaluationRequest>, ray: Readonly<SensorApertureRay>): SceneRadianceEvaluationResult;
  /** Spectral radiance at a plane point (frame units), the same value the callbacks return. */
  radianceAt(u: number, v: number, wavelengthNanometers: number): number;
}

const UNCERTAINTY = Object.freeze({ kind: "not-quantified" as const, limitation: "Analytic planar Lambertian scene; no measured scene, BRDF or illumination." });

/**
 * Wraps a chart or caller scene as a provider for the native environment RAW task. `irradianceScale` is
 * from {@link calculateIlluminantIrradianceScale}; caller radiance scenes ignore the illuminant.
 */
export function buildPlanarSceneRadianceProvider(input: {
  scene: ResolvedChartScene | CallerReflectanceScene | CallerRadianceScene;
  sceneId: string;
  providerProfileId: string;
  illuminant: ResolvedCaptureIlluminant;
  irradianceScale: number;
  geometry: PlanarSceneGeometry;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}): PlanarSceneRadianceProvider {
  const { scene, illuminant, irradianceScale, geometry } = input;
  const scale = geometry.metresPerFrameUnit, distance = geometry.distanceM, sceneId = input.sceneId, providerProfileId = input.providerProfileId;
  const evidence = input.evidence, limitations = input.limitations;
  const caller = "kind" in scene ? scene : undefined, chart = caller ? undefined : scene as ResolvedChartScene;
  function radianceAt(u: number, v: number, nm: number): number {
    if (chart) return chart.reflectanceAt(u, v, nm) * irradianceScale * illuminant.shape.evaluate(nm) / Math.PI;
    const point = Object.freeze({ xM: u * scale, yM: v * scale, u, v, wavelengthNanometers: nm });
    const value = caller!.evaluate(point);
    if (caller!.kind === "reflectance-function") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new InvalidConfigurationError("Scene reflectance function must return a value in [0, 1].");
      return value * irradianceScale * illuminant.shape.evaluate(nm) / Math.PI;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new InvalidConfigurationError("Scene radiance function must return a finite non-negative radiance.");
    return value;
  }
  function result(request: Readonly<SceneRadianceEvaluationRequest>, radiance: number): SceneRadianceEvaluationResult {
    return { schemaVersion: "0.1.0", sampleId: request.sampleId, sceneId, providerProfileId, wavelengthNanometers: request.wavelengthNanometers,
      wavelengthBasis: request.wavelengthBasis as SceneRadianceEvaluationResult["wavelengthBasis"], quantity: "outgoing-spectral-radiance", unit: "W/m^2/sr/nm",
      spectralRadianceWattsPerSquareMeterSteradianNanometer: radiance, scientificStatus: "approximation", uncertainty: UNCERTAINTY, evidence, limitations };
  }
  return {
    sceneId, providerProfileId, radianceAt,
    evaluateRadiance(request): SceneRadianceEvaluationResult {
      const target = request.target;
      if (target.kind !== "environment-direction") throw new InvalidConfigurationError("Planar scene provider needs environment-direction queries.");
      const o = target.outgoingDirectionUnitVector, lz = -o.z;
      if (!(lz > 0)) throw new InvalidConfigurationError("Planar scene query does not point toward the scene plane.");
      const t = distance / lz;
      return result(request, radianceAt(-o.x * t / scale, -o.y * t / scale, request.wavelengthNanometers));
    },
    evaluateApertureRadiance(request, ray): SceneRadianceEvaluationResult {
      const d = ray.directionUnitVector, origin = ray.originM;
      if (!(d.z > 0)) throw new InvalidConfigurationError("Planar scene pupil ray does not point toward the scene plane.");
      const t = (distance - origin.z) / d.z;
      return result(request, radianceAt((origin.x + d.x * t) / scale, (origin.y + d.y * t) / scale, request.wavelengthNanometers));
    }
  };
}

/**
 * Public scene-preset provider: an engine chart (or caller reflectance/radiance function) on a plane
 * `distanceM` in front of the camera, `framedWidthM` wide (frame units u = ±1 at its edges), lit by
 * `illuminant` at `illuminanceLux`. The returned `evaluateRadiance`/`evaluateApertureRadiance` follow the
 * native environment RAW provider contract and answer requests for scene `sceneId` / provider
 * `providerProfileId`.
 */
export function createPlanarSceneRadianceProvider(input: {
  scene: ChartScene | CallerReflectanceScene | CallerRadianceScene;
  illuminant: CaptureIlluminant;
  illuminanceLux: number;
  distanceM: number;
  framedWidthM: number;
  /** Frame height / width. */
  aspect: number;
  sceneId: string;
  providerProfileId: string;
}): PlanarSceneRadianceProvider & { chart: ResolvedChartScene | null } {
  requireInputObject(input, "createPlanarSceneRadianceProvider input");
  const keys = ["scene", "illuminant", "illuminanceLux", "distanceM", "framedWidthM", "aspect", "sceneId", "providerProfileId"];
  for (const key of Object.keys(input)) if (!keys.includes(key)) throw new InvalidConfigurationError("createPlanarSceneRadianceProvider input has unknown field \"" + key + "\".");
  for (const key of ["illuminanceLux", "distanceM", "framedWidthM", "aspect"] as const) {
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new InvalidConfigurationError(key + " must be a positive finite number.");
  }
  for (const key of ["sceneId", "providerProfileId"] as const) if (typeof input[key] !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input[key])) throw new InvalidConfigurationError(key + " must be a public opaque ID.");
  requireInputObject(input.scene, "scene");
  const caller = "kind" in input.scene ? requireCallerScene(input.scene) : undefined;
  const chart = caller ? null : resolveChartScene({ scene: input.scene as ChartScene, aspect: input.aspect });
  const illuminant = resolveCaptureIlluminant(input.illuminant);
  const provider = buildPlanarSceneRadianceProvider({ scene: chart ?? caller!, sceneId: input.sceneId, providerProfileId: input.providerProfileId, illuminant,
    irradianceScale: calculateIlluminantIrradianceScale(illuminant.shape, input.illuminanceLux),
    geometry: { distanceM: input.distanceM, metresPerFrameUnit: input.framedWidthM / 2 },
    evidence: [{ sourceOrigin: "photivra", sourceReference: "photivra:planar-scene-provider", reuseStatus: "photivra-owned" }],
    limitations: ["Planar Lambertian scene under uniform illumination; no shadows, inter-reflection, gloss or fluorescence."] });
  return { ...provider, chart };
}

/** Validates a caller scene function record. */
export function requireCallerScene(value: unknown): CallerReflectanceScene | CallerRadianceScene {
  requireInputObject(value, "scene");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (key !== "kind" && key !== "sceneId" && key !== "evaluate") throw new InvalidConfigurationError("Unknown scene field: " + key + ".");
  if ((record.kind !== "reflectance-function" && record.kind !== "radiance-function") || typeof record.evaluate !== "function" ||
    typeof record.sceneId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(record.sceneId)) throw new InvalidConfigurationError("A caller scene needs kind, a public sceneId and an evaluate function.");
  return record as unknown as CallerReflectanceScene | CallerRadianceScene;
}
