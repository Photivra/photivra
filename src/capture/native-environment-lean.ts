// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Lean per-site optical executor for createNativeEnvironmentRawTask (2.0 performance). It removes per-site
 * re-validation and result-envelope construction that is provably redundant, and nothing else:
 *
 * - A site whose environment is strictly equal (plain data, same keys in the same order, Object.is leaves) to
 *   an earlier fully validated "template" site except for the two index-bound fields (temporalIntegrationId and
 *   sensor.spatialSampling.site), and whose colour-sampling site has the same CFA phase, passes every
 *   site-independent check exactly as the template did. Only the site-dependent work is recomputed: aperture
 *   geometry and its bounds, the local exposure window, field throughput, aperture rays, query projection and
 *   provider requests, with the same arithmetic in the same order as the full planner.
 * - Execution replays the same callbacks with the same frozen requests, validates every provider result with
 *   the same parser, and evaluates the photon/charge-rate arithmetic of the full chain (scene-to-sensor
 *   acceptance, spatio-spectral reduction, operating range, EQE electron rate, Kahan sums, temporal midpoint
 *   sums) in the same floating-point operation order.
 * - Every data-dependent acceptance predicate of the full chain is evaluated. When one fails, or anything is
 *   unexpected, the lean path hands the exact same inputs to the full engine function, which then throws its own
 *   error (or returns its own value). Planning falls back before any callback; execution falls back at the step
 *   whose check failed, so callbacks, errors and their order are unchanged.
 * - Each template verifies itself: its own site is planned by both planners and executed by the full executor,
 *   and the lean results must be bit-identical (Object.is) before any other site uses the template. A mismatch
 *   disables the template and its sites run the full path.
 *
 * Sampled-PSF environments are not lean-eligible and always run the full path.
 * @see docs/NATIVE_RAW_AND_PRINT.md for the invariance argument and limits.
 */

import type { SimulateEnvironmentSensorRawFrameInput } from "./environment-raw-producer.js";
import type { planEnvironmentSensorPhotoSignal, executeEnvironmentSensorPhotoSignal, EnvironmentRadianceEvaluator,
  EnvironmentApertureRadianceEvaluator } from "../sensor/environment-photo-signal.js";
import type { SensorEqeTemporalPhotoSignal } from "../sensor/temporal-photo-signal.js";
import { createSensorEqeTemporalPhotoSignal } from "../sensor/temporal-photo-signal.js";
import { parseSceneRadianceEvaluationRequest, parseSceneRadianceEvaluationResult, validateSceneRadianceEvaluationBindings,
  type SceneRadianceEvaluationRequest } from "../schema/scene-radiance.js";
import { calculateSceneRadianceToSensorIrradiance } from "../optics/scene-to-sensor-irradiance.js";
import { calculateSensorApertureRays, type SensorApertureRay } from "../optics/sensor-aperture-rays.js";
import { calculateIlluminationVignetting } from "../optics/illumination-vignetting.js";
import { applyPhysicalCameraRotation, resolveProjectionDistanceMm } from "../motion/camera-rotation.js";
import { prepareCaptureExposureWindowSampler } from "../sensor/exposure-window.js";
import { isPublicOpaqueId } from "../core/record-validation.js";
import { freezeOwnedData } from "../core/owned-data.js";

type Site = SimulateEnvironmentSensorRawFrameInput["sites"][number];
type Env = Site["environment"];
type FullPlan = ReturnType<typeof planEnvironmentSensorPhotoSignal>;
type FullResult = ReturnType<typeof executeEnvironmentSensorPhotoSignal>;
type Rec = Record<string, unknown>;
type FieldThroughput = FullPlan["instants"][number]["groups"][number]["taps"][number]["fieldThroughput"];

/** Most distinct templates one event keeps; further distinct sites simply run the full path. */
const MAXIMUM_TEMPLATES = 64;
const SQUARE_MICROMETERS_TO_SQUARE_METERS = 1e-12;
const REDUCTION_TOLERANCE = 1e-10;

/** Disables the lean executor process-wide (internal; tests compare both paths). */
let leanDisabled = false;
export function setNativeEnvironmentLeanExecutionEnabled(enabled: boolean): void { leanDisabled = !enabled; }

function isPlainRecord(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
/**
 * Strict structural equality of engine-owned structured-clone output: Object.is leaves (0 and -0 differ), plain
 * records with the same own keys in the same order, dense arrays without extra properties. Anything else is equal
 * only by reference. `memo` remembers subtrees already proven equal (both sides are engine-owned and unmutated).
 */
function sameData(a: unknown, b: unknown, memo: WeakMap<object, object>): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (memo.get(a) === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || Object.getPrototypeOf(a) !== Array.prototype || Object.getPrototypeOf(b) !== Array.prototype) return false;
    const length = a.length;
    if (length !== b.length) return false;
    for (let i = 0; i < length; i++) if (!(i in a) || !(i in b) || !sameData(a[i], b[i], memo)) return false;
    if (Object.keys(a).length !== length || Object.keys(b).length !== length) return false;
  } else {
    if (Array.isArray(b) || !isPlainRecord(a) || !isPlainRecord(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
    if (!sameKeysExcept(a as Rec, b as Rec, undefined, memo)) return false;
  }
  memo.set(a, b);
  return true;
}
/** Same own keys in the same order and equal values, except `skip` (compared by the caller). */
function sameKeysExcept(a: Rec, b: Rec, skip: string | undefined, memo: WeakMap<object, object>): boolean {
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length || Object.getOwnPropertySymbols(a).length !== 0 || Object.getOwnPropertySymbols(b).length !== 0) return false;
  for (let i = 0; i < ak.length; i++) if (ak[i] !== bk[i]) return false;
  for (let i = 0; i < ak.length; i++) {
    const key = ak[i]!;
    if (key !== skip && !sameData(a[key], b[key], memo)) return false;
  }
  return true;
}
function plainChild(value: unknown, key: string): Rec | undefined {
  const child = typeof value === "object" && value !== null ? (value as Rec)[key] : undefined;
  return typeof child === "object" && child !== null && !Array.isArray(child) && isPlainRecord(child) ? child as Rec : undefined;
}
/** Environment equality except temporalIntegrationId and sensor.spatialSampling.site (index-bound, checked per site). */
function environmentMatches(e: Env, t: Env, memo: WeakMap<object, object>): boolean {
  const er = e as unknown as Rec, tr = t as unknown as Rec;
  if (typeof er !== "object" || er === null || !isPlainRecord(er)) return false;
  const es = plainChild(er, "sensor"), ts = plainChild(tr, "sensor"), ess = plainChild(es, "spatialSampling"), tss = plainChild(ts, "spatialSampling");
  if (!es || !ts || !ess || !tss) return false;
  return environmentShallow(er, tr, memo);
}
/** Top level and sensor compared key by key so only the two index-bound fields are skipped. */
function environmentShallow(er: Rec, tr: Rec, memo: WeakMap<object, object>): boolean {
  const ek = Object.keys(er), tk = Object.keys(tr);
  if (ek.length !== tk.length || Object.getOwnPropertySymbols(er).length !== 0) return false;
  for (let i = 0; i < ek.length; i++) if (ek[i] !== tk[i]) return false;
  for (const key of ek) {
    if (key === "temporalIntegrationId") continue;
    if (key === "sensor") {
      const es = er.sensor as Rec, ts = tr.sensor as Rec, sk = Object.keys(es), tsk = Object.keys(ts);
      if (sk.length !== tsk.length || Object.getOwnPropertySymbols(es).length !== 0) return false;
      for (let i = 0; i < sk.length; i++) if (sk[i] !== tsk[i]) return false;
      for (const sensorKey of sk) {
        if (sensorKey === "spatialSampling") {
          if (!sameKeysExcept(es.spatialSampling as Rec, ts.spatialSampling as Rec, "site", memo)) return false;
        } else if (!sameData(es[sensorKey], ts[sensorKey], memo)) return false;
      }
    } else if (!sameData(er[key], tr[key], memo)) return false;
  }
  return true;
}

interface SpatialNode { xPhase: number; yPhase: number; aaX: number; aaY: number }
interface ExecutionConstants {
  /** Per spatial node: combined normalized weight and geometric area measure in m². */
  weight: Float64Array; areaSquareMeters: Float64Array;
  /** Per spectral node: d-lambda, photon energy and effective EQE exactly as the template's full chain used them. */
  measure: Float64Array; photonEnergy: Float64Array; eqe: Float64Array;
  /** Per spectral node: scene-to-sensor acceptance before field throughput. */
  acceptance: Float64Array;
  rangeKind: "power" | "irradiance"; rangeMinimum: number; rangeMaximum: number; perBin: boolean;
  photo: SensorEqeTemporalPhotoSignal;
}
interface Template {
  environment: Env;
  phase: number;
  /** True until the template's plan constants are derived and self-checked. */
  disabled: boolean;
  consts?: PlanConstants;
  execution?: ExecutionConstants;
  /** undefined until the template site executed through the full path. */
  executionVerified?: boolean;
}
interface PlanConstants {
  spectralCount: number; spatialCount: number; temporalCount: number; pupilCount: number; count: number;
  wavelengths: Float64Array;
  nodes: readonly FullPlan["instants"][number]["groups"][number]["node"][];
  spatial: SpatialNode[];
  geometry: { firstX: number; firstY: number; pitchX: number; pitchY: number; offsetX: number; offsetY: number;
    widthUm: number; heightUm: number; imagingWidthMm: number; imagingHeightMm: number };
  sampler: ReturnType<typeof prepareCaptureExposureWindowSampler>;
  projectionDistanceMm: number;
  focus: FullPlan["focus"];
  requestBase: { providerProfileId: string; sceneId: string; illuminationProfileId: string; materialResponseProfileId: string; wavelengthBasis: string };
  sceneBindings: FullPlan["sceneBindings"];
}
interface LeanTap {
  request: SceneRadianceEvaluationRequest;
  sourcePointImagePlaneMm: { x: number; y: number };
  fieldThroughput: FieldThroughput;
  fieldFactor: number;
  fieldValid: boolean;
  apertureRays?: readonly SensorApertureRay[];
}
/** A lean site plan. `owned` and `count` mirror the full plan fields the native task reads. */
export interface LeanEnvironmentPlan {
  readonly lean: true;
  readonly template: Template;
  readonly index: number;
  readonly owned: Env;
  readonly count: number;
  readonly site: { x: number; y: number };
  readonly start: number; readonly end: number; readonly duration: number;
  readonly instants: readonly { time: number; taps: readonly LeanTap[] }[];
}
export function isLeanEnvironmentPlan(plan: unknown): plan is LeanEnvironmentPlan {
  return typeof plan === "object" && plan !== null && (plan as { lean?: unknown }).lean === true;
}

export interface NativeEnvironmentLeanFrame {
  frameId: string;
  nativeWidth: number;
  nativeHeight: number;
  repeatWidth: number;
  repeatHeight: number;
  /** True only for the one-to-one shared-top-left native/colour-site binding (identity site mapping). */
  identityBinding: boolean;
}

/** Per-event lean executor state. Templates and memos live only for one native task. */
export interface NativeEnvironmentLeanExecutor {
  /**
   * Classifies a planned site: a lean plan when it matches a verified template, "candidate" when it should be
   * planned in full with "full" retention and offered to admitCandidate, or undefined (plan in full, photo-only).
   */
  plan(environment: Env, index: number): LeanEnvironmentPlan | "candidate" | undefined;
  /** Registers a fully planned ("full" retention) candidate; never throws. */
  admitCandidate(environment: Env, index: number, plan: FullPlan): void;
  /** True when index is an admitted candidate whose full execution must use "full" retention and be verified. */
  isCandidate(index: number): boolean;
  /** Verifies a candidate's full execution (full retention) against the lean arithmetic; never throws. */
  verifyCandidate(index: number, plan: FullPlan, result: FullResult): void;
  /**
   * Executes a lean plan. Returns the photo signal, or undefined when the template could not be verified; the
   * caller then plans and executes this site in full.
   */
  execute(plan: LeanEnvironmentPlan, evaluate: EnvironmentRadianceEvaluator,
    aperture: EnvironmentApertureRadianceEvaluator | undefined): SensorEqeTemporalPhotoSignal | undefined;
}

function siteOf(environment: Env): { x: unknown; y: unknown } | undefined {
  const site = plainChild(plainChild(plainChild(environment, "sensor"), "spatialSampling"), "site");
  return site as { x: unknown; y: unknown } | undefined;
}

/** Site-dependent planning with the full planner's arithmetic; undefined on any doubt (the caller plans in full). */
function geometry(t: Template, k: PlanConstants, frame: NativeEnvironmentLeanFrame, environment: Env, index: number): LeanEnvironmentPlan | undefined {
  try {
    const x = index % frame.nativeWidth, y = Math.floor(index / frame.nativeWidth), site = siteOf(environment);
    if (!site || site.x !== x || site.y !== y || !isPublicOpaqueId(environment.temporalIntegrationId)) return undefined;
    const g = k.geometry;
    // resolveSensorSamplingAperture: per-site aperture centre and bounds.
    const siteCenterFromTopLeftX = g.firstX + x * g.pitchX, siteCenterFromTopLeftY = g.firstY + y * g.pitchY;
    const apertureCenterFromTopLeftX = siteCenterFromTopLeftX + g.offsetX, apertureCenterFromTopLeftY = siteCenterFromTopLeftY + g.offsetY;
    const imagingWidthMicrometers = g.imagingWidthMm * 1000, imagingHeightMicrometers = g.imagingHeightMm * 1000;
    if (apertureCenterFromTopLeftX - g.widthUm / 2 < 0 || apertureCenterFromTopLeftY - g.heightUm / 2 < 0 ||
      apertureCenterFromTopLeftX + g.widthUm / 2 > imagingWidthMicrometers || apertureCenterFromTopLeftY + g.heightUm / 2 > imagingHeightMicrometers) return undefined;
    const centerX = -g.imagingWidthMm / 2 + apertureCenterFromTopLeftX / 1000, centerY = -g.imagingHeightMm / 2 + apertureCenterFromTopLeftY / 1000;
    // calculateSensorSpatialSamplingQuadrature: tensor midpoint nodes minus the AA offset.
    const widthMm = g.widthUm / 1000, heightMm = g.heightUm / 1000;
    const leftMm = centerX - widthMm / 2, topMm = centerY - heightMm / 2;
    const sources: { x: number; y: number }[] = [];
    for (const node of k.spatial) {
      const source = { x: (leftMm + node.xPhase * widthMm) - node.aaX, y: (topMm + node.yPhase * heightMm) - node.aaY };
      if (!Number.isFinite(source.x) || !Number.isFinite(source.y)) return undefined;
      sources.push(source);
    }
    const window = k.sampler({ x: x + .5, y: y + .5 });
    const start = window.startOffsetSecondsFromOpeningReference, end = window.endOffsetSecondsFromOpeningReference;
    const duration = window.localExposureDurationSeconds;
    const e = environment as unknown as Rec, optics = e.optics as Rec, motion = e.motion as Rec;
    const focalLengthMm = optics.focalLengthMm as number, nominalFNumber = optics.nominalFNumber as number;
    const omega = motion.angularVelocityRadPerSec as { pitch: number; yaw: number; roll: number };
    const pupil = e.pupil as Parameters<typeof calculateSensorApertureRays>[0]["pupil"] | undefined;
    if (pupil !== undefined && calculateSensorApertureRays({ sourcePointNativeSensorMm: { x: 0, y: 0 }, focalLengthMm, nominalFNumber, focus: k.focus,
      pupil, angularVelocityRadPerSec: omega, timeSecondsFromOpeningReference: start }).value.rays.length !== k.pupilCount) return undefined;
    // Field throughput at every planned point (identical for every spectral node of one spatial node).
    const field = e.fieldThroughput as Rec;
    const fields = sources.map((point): { value: FieldThroughput; factor: number; valid: boolean } => {
      if (field.kind === "unity") return { value: { kind: "unity" }, factor: 1, valid: true };
      const result = calculateIlluminationVignetting({ imagePointMm: { x: point.x, y: -point.y },
        profile: field.profile as Parameters<typeof calculateIlluminationVignetting>[0]["profile"] }).value;
      const imagePoint = { x: point.x, y: -point.y };
      const scale = Math.max(1, Math.abs(imagePoint.x), Math.abs(imagePoint.y), Math.abs(result.imagePointMm.x), Math.abs(result.imagePointMm.y));
      const tolerance = Number.EPSILON * 64 * scale, factor = result.linearThroughputFactor;
      const valid = !(Math.abs(result.imagePointMm.x - imagePoint.x) > tolerance || Math.abs(result.imagePointMm.y - imagePoint.y) > tolerance) &&
        Number.isFinite(factor) && factor > 0 && factor <= 1;
      return { value: { kind: "illumination-vignetting-result", result }, factor, valid };
    });
    const measure = duration / k.temporalCount;
    let previous = -Infinity;
    const instants: { time: number; taps: LeanTap[] }[] = [];
    const pd = k.projectionDistanceMm, base = k.requestBase, id = environment.temporalIntegrationId;
    for (let ti = 0; ti < k.temporalCount; ti++) {
      const time = start + (ti + .5) * measure;
      if (!(time > start && time > previous && time < end)) return undefined;
      previous = time;
      if (!Number.isFinite(time) || time < 0) return undefined;
      const displacement = { pitch: omega.pitch * time, yaw: omega.yaw * time, roll: omega.roll * time };
      const taps: LeanTap[] = [];
      for (let s = 0; s < k.spectralCount; s++) for (let p = 0; p < k.spatialCount; p++) {
        const point = sources[p]!, gi = s * k.spatialCount + p;
        const apertureRays = pupil === undefined ? undefined : calculateSensorApertureRays({ sourcePointNativeSensorMm: { ...point }, focalLengthMm,
          nominalFNumber, focus: k.focus, pupil, angularVelocityRadPerSec: omega, timeSecondsFromOpeningReference: time }).value.rays;
        // calculateSensorEnvironmentRadianceQuery with calculateInverseCameraRotationImageMapping.
        const imagePointMm = { x: point.x, y: -point.y };
        if (!Number.isFinite(imagePointMm.x) || !Number.isFinite(imagePointMm.y)) return undefined;
        const reference = applyPhysicalCameraRotation({ x: imagePointMm.x / pd, y: imagePointMm.y / pd, z: 1 }, displacement, "camera-to-reference");
        if (!Number.isFinite(reference.z) || reference.z <= 0) return undefined;
        const rx = pd * (reference.x / reference.z), ry = pd * (reference.y / reference.z);
        const length = Math.hypot(rx, ry, pd);
        const ray = { x: rx / length, y: ry / length, z: pd / length };
        const request = freezeOwnedData(parseSceneRadianceEvaluationRequest({ schemaVersion: "0.1.0",
          sampleId: `${id}-t${ti}-n${gi}-p0`, providerProfileId: base.providerProfileId, sceneId: base.sceneId,
          illuminationProfileId: base.illuminationProfileId, materialResponseProfileId: base.materialResponseProfileId,
          wavelengthNanometers: k.wavelengths[s], wavelengthBasis: base.wavelengthBasis, timeSecondsFromExposureStart: time,
          target: { kind: "environment-direction", outgoingDirectionUnitVector: { x: -ray.x, y: -ray.y, z: -ray.z } } }));
        const f = fields[p]!;
        taps.push({ request, sourcePointImagePlaneMm: imagePointMm, fieldThroughput: f.value, fieldFactor: f.factor, fieldValid: f.valid,
          ...(apertureRays === undefined ? {} : { apertureRays }) });
      }
      instants.push({ time, taps });
    }
    return { lean: true, template: t, index, owned: environment, count: k.count, site: { x, y }, start, end, duration, instants };
  } catch {
    return undefined;
  }
}

/** Lean photo arithmetic. values[ti][s*P+p]; returns undefined when any data-dependent predicate fails. */
function photo(k: PlanConstants, c: ExecutionConstants, values: readonly Float64Array[], environment: Env, site: { x: number; y: number },
  start: number, end: number, duration: number, times: readonly number[]): SensorEqeTemporalPhotoSignal | undefined {
  const S = k.spectralCount, P = k.spatialCount, T = k.temporalCount;
  const photonRates = new Float64Array(T), electronRates = new Float64Array(T);
  const flux = new Float64Array(S), contribution = new Float64Array(S), averageContribution = new Float64Array(S);
  for (let ti = 0; ti < T; ti++) {
    const v = values[ti]!;
    // reduceSensorSpatioSpectralIrradiance
    let integratedAverage = 0, integratedFlux = 0;
    for (let s = 0; s < S; s++) {
      let average = 0, geometric = 0;
      for (let p = 0; p < P; p++) {
        const value = v[s * P + p]!;
        average += value * c.weight[p]!;
        geometric += value * c.areaSquareMeters[p]!;
        if (!Number.isFinite(average) || !Number.isFinite(geometric)) return undefined;
      }
      const averageTerm = average * c.measure[s]!, fluxTerm = geometric * c.measure[s]!;
      integratedAverage += averageTerm; integratedFlux += fluxTerm;
      if (!Number.isFinite(integratedAverage) || !Number.isFinite(integratedFlux)) return undefined;
      flux[s] = geometric; contribution[s] = fluxTerm; averageContribution[s] = averageTerm;
    }
    // assessSensorResponseOperatingRange: selected metric and per-bin values inside the calibrated range.
    const metric = c.rangeKind === "power" ? integratedFlux : integratedAverage;
    if (!Number.isFinite(metric) || metric < 0 || metric < c.rangeMinimum || metric > c.rangeMaximum) return undefined;
    if (c.perBin) for (let s = 0; s < S; s++) {
      const value = c.rangeKind === "power" ? contribution[s]! : averageContribution[s]!;
      if (!Number.isFinite(value) || value < 0 || value < c.rangeMinimum || value > c.rangeMaximum) return undefined;
    }
    // calculateSensorEqeElectronRate: reduction node checks, compensated power, then per-node rates.
    let powerSum = 0, powerCorrection = 0;
    for (let s = 0; s < S; s++) {
      const expected = flux[s]! * c.measure[s]!;
      if (!Number.isFinite(flux[s]!) || flux[s]! < 0 || !Number.isFinite(contribution[s]!) || contribution[s]! < 0 ||
        !Number.isFinite(expected) || !approximatelyEqual(contribution[s]!, expected)) return undefined;
      const adjusted = contribution[s]! - powerCorrection, next = powerSum + adjusted;
      powerCorrection = (next - powerSum) - adjusted; powerSum = next;
    }
    if (!(Number.isFinite(integratedFlux) && integratedFlux >= 0) || !approximatelyEqual(powerSum, integratedFlux)) return undefined;
    let photonSum = 0, photonCorrection = 0, electronSum = 0, electronCorrection = 0;
    for (let s = 0; s < S; s++) {
      const radiantPower = flux[s]! * c.measure[s]!;
      const photonRate = radiantPower / c.photonEnergy[s]!;
      const electronRate = photonRate * c.eqe[s]!;
      if (!Number.isFinite(radiantPower) || !Number.isFinite(photonRate) || !Number.isFinite(electronRate)) return undefined;
      const adjustedPhotons = photonRate - photonCorrection, nextPhotons = photonSum + adjustedPhotons;
      photonCorrection = (nextPhotons - photonSum) - adjustedPhotons; photonSum = nextPhotons;
      const adjustedElectrons = electronRate - electronCorrection, nextElectrons = electronSum + adjustedElectrons;
      electronCorrection = (nextElectrons - electronSum) - adjustedElectrons; electronSum = nextElectrons;
    }
    if (!Number.isFinite(photonSum) || !Number.isFinite(electronSum)) return undefined;
    photonRates[ti] = photonSum; electronRates[ti] = electronSum;
  }
  // sumTemporalEqeRateExpectations with the binding's seconds-valued measure.
  const measure = duration / T;
  let photons = 0, electrons = 0, photonCorrection = 0, electronCorrection = 0;
  for (let ti = 0; ti < T; ti++) {
    const p = photonRates[ti]! * measure, e = electronRates[ti]! * measure;
    const ap = p - photonCorrection, np = photons + ap; photonCorrection = (np - photons) - ap; photons = np;
    const ae = e - electronCorrection, ne = electrons + ae; electronCorrection = (ne - electrons) - ae; electrons = ne;
  }
  // parseSensorEqeTemporalPhotoSignal: finite non-negative rates, EQE domain and finite counts.
  for (let ti = 0; ti < T; ti++) {
    const pr = photonRates[ti]!, er = electronRates[ti]!;
    if (!Number.isFinite(pr) || pr < 0 || !Number.isFinite(er) || er < 0 || er > pr) return undefined;
  }
  if (!Number.isFinite(photons) || photons < 0 || !Number.isFinite(electrons) || electrons < 0) return undefined;
  const temporalSamples: object[] = [];
  for (let ti = 0; ti < T; ti++) temporalSamples.push(Object.freeze({ timeSecondsFromOpeningReference: times[ti]!,
    incidentPhotonRatePerSecond: photonRates[ti]!, expectedGeneratedElectronRatePerSecond: electronRates[ti]! }));
  return Object.freeze({ ...c.photo, temporalIntegrationId: environment.temporalIntegrationId, site: Object.freeze({ x: site.x, y: site.y }),
    startOffsetSecondsFromOpeningReference: start, endOffsetSecondsFromOpeningReference: end, localExposureDurationSeconds: duration,
    expectedIncidentPhotonCount: photons, expectedGeneratedElectronCount: electrons, temporalSamples: Object.freeze(temporalSamples) }) as SensorEqeTemporalPhotoSignal;
}

/** The temporal photo-signal input the full executor builds from these irradiance values (non-PSF plans). */
function fullPhotoInput(k: PlanConstants, values: readonly Float64Array[], environment: Env, times: readonly number[]): Parameters<typeof createSensorEqeTemporalPhotoSignal>[0] {
  return { temporalIntegrationId: environment.temporalIntegrationId, exposure: { ...environment.sensor, samples: values.map((v, ti) => ({
    temporalSampleIndex: ti, timeSecondsFromOpeningReference: times[ti]!,
    irradianceSamples: k.nodes.map((node, gi) => ({ node: structuredClone(node), spectralIrradianceWattsPerSquareMeterPerNanometer: v[gi]! })) })) } };
}

/** Derives a template's plan constants from its full plan; throws when anything is outside the lean scope. */
function planConstants(environment: Env, plan: FullPlan): PlanConstants {
  const e = environment as unknown as Rec, sensor = e.sensor as Rec, spatial = sensor.spatialSampling as Rec;
  const apertureProfile = spatial.samplingApertureProfile as Rec;
  const aperture = apertureProfile.geometricSensitiveAperture as Rec, lattice = apertureProfile.siteCenterLattice as Rec;
  const first = lattice.firstSiteCenterFromImagingAreaTopLeftMicrometers as { x: number; y: number };
  const offset = aperture.centerOffsetFromSiteCenterMicrometers as { x: number; y: number };
  const imaging = spatial.imagingArea as { widthMm: number; heightMm: number };
  const spatialNodes = plan.spatialQuadrature.nodes, spectralNodes = plan.spectralQuadrature.nodes;
  const countX = spatial.spatialSampleCountX as number, countY = spatial.spatialSampleCountY as number;
  const S = spectralNodes.length, P = spatialNodes.length, T = plan.instants.length, groups = plan.instants[0]!.groups;
  const pupilCount = plan.count / (S * P * T);
  if (!Number.isSafeInteger(pupilCount) || pupilCount < 1 || groups.length !== S * P || plan.instants.some(i => i.groups.some(g => g.taps.length !== 1))) {
    throw new Error("outside lean scope");
  }
  return {
    spectralCount: S, spatialCount: P, temporalCount: T, pupilCount, count: plan.count,
    wavelengths: Float64Array.from(spectralNodes, n => n.wavelengthNanometers),
    nodes: groups.map(group => freezeOwnedData(structuredClone(group.node))),
    spatial: spatialNodes.map(n => ({ xPhase: (n.apertureSampleXIndex + 0.5) / countX, yPhase: (n.apertureSampleYIndex + 0.5) / countY,
      aaX: n.antiAliasingOffsetMicrometers.x / 1000, aaY: n.antiAliasingOffsetMicrometers.y / 1000 })),
    geometry: { firstX: first.x, firstY: first.y, pitchX: lattice.pitchXMicrometers as number, pitchY: lattice.pitchYMicrometers as number,
      offsetX: offset.x, offsetY: offset.y, widthUm: aperture.widthMicrometers as number, heightUm: aperture.heightMicrometers as number,
      imagingWidthMm: imaging.widthMm, imagingHeightMm: imaging.heightMm },
    sampler: prepareCaptureExposureWindowSampler((sensor.localExposure as Rec).exposureWindowInput as Parameters<typeof prepareCaptureExposureWindowSampler>[0]),
    projectionDistanceMm: resolveProjectionDistanceMm((e.optics as Rec).focalLengthMm as number,
      plan.focus.kind === "finite" ? plan.focus.distanceM : undefined).projectionDistanceMm,
    focus: plan.focus,
    requestBase: { providerProfileId: plan.sceneBindings.providerProfile.profileId, sceneId: plan.sceneBindings.providerProfile.sceneId,
      illuminationProfileId: plan.sceneBindings.illuminationProfile.profileId, materialResponseProfileId: plan.sceneBindings.materialResponseProfile.profileId,
      wavelengthBasis: plan.spectralQuadrature.wavelengthBasis },
    sceneBindings: plan.sceneBindings
  };
}

/** The lean planner must reproduce the template site's full plan bit for bit. */
function planReproduced(lean: LeanEnvironmentPlan | undefined, plan: FullPlan, k: PlanConstants): boolean {
  if (!lean || lean.count !== plan.count || lean.instants.length !== plan.instants.length) return false;
  const check = new WeakMap<object, object>();
  for (let ti = 0; ti < plan.instants.length; ti++) {
    const full = plan.instants[ti]!, mine = lean.instants[ti]!;
    if (!Object.is(full.time, mine.time) || full.temporalSampleIndex !== ti || full.groups.length !== mine.taps.length) return false;
    for (let gi = 0; gi < full.groups.length; gi++) {
      const fullTap = full.groups[gi]!.taps[0]!, tap = mine.taps[gi]!;
      if (!Object.isFrozen(fullTap.request) || !Object.isFrozen(tap.request) || !sameData(fullTap.request, tap.request, check) ||
        !sameData(fullTap.sourcePointImagePlaneMm, tap.sourcePointImagePlaneMm, check) ||
        !sameData(fullTap.fieldThroughput, tap.fieldThroughput, check) || !sameData(fullTap.apertureRays, tap.apertureRays, check) ||
        !sameData(full.groups[gi]!.node, k.nodes[gi], check)) return false;
    }
  }
  return true;
}

/** Derives and verifies execution constants from the template site's full ("full" retention) execution; undefined on mismatch. */
function executionConstants(k: PlanConstants, environment: Env, plan: FullPlan, result: FullResult): ExecutionConstants | undefined {
  const S = k.spectralCount, P = k.spatialCount, T = k.temporalCount;
  const value = result.value, stages = value.photo.value.exposure.value.samples[0]!.stages;
  const spatial = stages.spatialQuadrature.value.nodes, spectral = stages.spectralQuadrature.value.nodes;
  const rate = stages.electronRate.value.perWavelength, range = stages.operatingRange.value;
  if (spatial.length !== P || spectral.length !== S || rate.length !== S || value.instants.length !== T) return undefined;
  for (let s = 0; s < S; s++) if (rate[s]!.spectralSampleIndex !== s || spectral[s]!.spectralSampleIndex !== s) return undefined;
  const c: ExecutionConstants = {
    weight: Float64Array.from(spatial, n => n.combinedNormalizedSpatialWeight),
    areaSquareMeters: Float64Array.from(spatial, n => n.combinedAreaMeasureSquareMicrometers * SQUARE_MICROMETERS_TO_SQUARE_METERS),
    measure: Float64Array.from(spectral, n => n.wavelengthMeasureNanometers),
    photonEnergy: Float64Array.from(rate, n => n.photonEnergyJoules), eqe: Float64Array.from(rate, n => n.effectiveExternalQuantumEfficiency),
    acceptance: new Float64Array(S).fill(NaN),
    rangeKind: range.inputRange.kind === "wavelength-integrated-geometric-aperture-radiant-power" ? "power" : "irradiance",
    rangeMinimum: range.inputRange.minimumInclusive, rangeMaximum: range.inputRange.maximumInclusive,
    perBin: range.spectralInputModel.kind === "per-spectral-bin", photo: value.photo.value.photoSignal
  };
  // Acceptance before field throughput per wavelength, and every evaluation's irradiance, must reproduce exactly.
  const values: Float64Array[] = [];
  for (let ti = 0; ti < T; ti++) {
    const evaluations = value.instants[ti]!.evaluations, v = new Float64Array(S * P);
    let next = 0;
    for (let gi = 0; gi < S * P; gi++) {
      const s = Math.floor(gi / P), request = plan.instants[ti]!.groups[gi]!.taps[0]!.request;
      let integrated = 0;
      for (let r = 0; r < k.pupilCount; r++) {
        const evaluation = evaluations[next++];
        if (!evaluation) return undefined;
        const o = evaluation.optics.value;
        let a = o.transmissionPath === "spectral-transmission" ? o.paraxialGeometricAcceptanceSolidAngleSteradians * (o.spectralTransmissionFactor as number)
          : Math.PI / (4 * (o.effectiveWorkingTStop as number) * (o.effectiveWorkingTStop as number));
        a *= o.frontOfLensFilterTransmissionFactor;
        if (Number.isNaN(c.acceptance[s]!)) c.acceptance[s] = a; else if (!Object.is(c.acceptance[s], a)) return undefined;
        const acceptance = c.acceptance[s]! * o.fieldThroughputFactor;
        const irradiance = evaluation.result.spectralRadianceWattsPerSquareMeterSteradianNanometer * acceptance;
        if (!Object.is(acceptance, o.effectiveAcceptanceAfterTransmissionAndFieldSteradians) ||
          !Object.is(irradiance, o.sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer) ||
          evaluation.result.sampleId !== request.sampleId + (evaluation.apertureRay ? "-a" + evaluation.apertureRay.pupilSampleIndex : "")) return undefined;
        integrated += irradiance * (evaluation.apertureRay?.weight ?? 1);
      }
      v[gi] = integrated;
    }
    if (next !== evaluations.length) return undefined;
    values.push(v);
  }
  if (c.acceptance.some(Number.isNaN)) return undefined;
  const full = value.photo.value.photoSignal;
  const mine = photo(k, c, values, environment, full.site, full.startOffsetSecondsFromOpeningReference,
    full.endOffsetSecondsFromOpeningReference, full.localExposureDurationSeconds, plan.instants.map(i => i.time));
  return mine && sameData(mine, full, new WeakMap()) ? c : undefined;
}

export function createNativeEnvironmentLeanExecutor(frame: NativeEnvironmentLeanFrame): NativeEnvironmentLeanExecutor {
  const templates: Template[] = [];
  const candidates = new Map<number, Template>();
  const memo = new WeakMap<object, object>();
  const enabled = !leanDisabled && frame.identityBinding && frame.repeatWidth > 0 && frame.repeatHeight > 0;
  const phaseOf = (index: number): number => {
    const x = index % frame.nativeWidth, y = Math.floor(index / frame.nativeWidth);
    return (y % frame.repeatHeight) * frame.repeatWidth + (x % frame.repeatWidth);
  };
  return {
    plan(environment, index) {
      if (!enabled || (plainChild(environment, "psf")?.kind !== "not-applied")) return undefined;
      const phase = phaseOf(index);
      let t: Template | undefined;
      try {
        for (const template of templates) if (template.phase === phase && environmentMatches(environment, template.environment, memo)) { t = template; break; }
      } catch {
        return undefined;
      }
      if (!t) return templates.length < MAXIMUM_TEMPLATES ? "candidate" : undefined;
      if (t.disabled || !t.consts || t.executionVerified === false) return undefined;
      return geometry(t, t.consts, frame, environment, index);
    },
    admitCandidate(environment, index, plan) {
      const template: Template = { environment, phase: phaseOf(index), disabled: true };
      templates.push(template);
      candidates.set(index, template);
      try {
        const k = planConstants(environment, plan);
        if (!planReproduced(geometry(template, k, frame, environment, index), plan, k)) return;
        template.consts = k;
        template.disabled = false;
      } catch {
        // An ineligible template leaves its sites on the full path.
      }
    },
    isCandidate(index) { return candidates.has(index); },
    verifyCandidate(index, plan, result) {
      const t = candidates.get(index);
      if (!t) return;
      candidates.delete(index);
      t.executionVerified = false;
      try {
        if (t.disabled || !t.consts) return;
        const c = executionConstants(t.consts, t.environment, plan, result);
        if (!c) return;
        t.execution = c;
        t.executionVerified = true;
      } catch {
        // Unverified: sites of this template run the full path.
      }
    },
    execute(plan, evaluate, aperture) {
      const t = plan.template, c = t.execution, k = t.consts;
      if (t.executionVerified !== true || !c || !k) return undefined;
      const environment = plan.owned, optics = (environment as unknown as Rec).optics;
      const S = k.spectralCount, P = k.spatialCount;
      const values: Float64Array[] = [], times: number[] = [];
      for (const instant of plan.instants) {
        const v = new Float64Array(S * P);
        for (let gi = 0; gi < S * P; gi++) {
          const tap = instant.taps[gi]!, s = Math.floor(gi / P);
          let integrated = 0;
          const support: readonly (SensorApertureRay | undefined)[] = tap.apertureRays ?? [undefined];
          for (const ray of support) {
            const base = tap.request;
            const request = ray === undefined ? base : freezeOwnedData({ ...base, sampleId: base.sampleId + "-a" + ray.pupilSampleIndex,
              target: { kind: "environment-direction" as const, outgoingDirectionUnitVector: {
                x: -ray.directionUnitVector.x, y: -ray.directionUnitVector.y, z: -ray.directionUnitVector.z } } });
            const apertureRay = ray === undefined ? undefined : freezeOwnedData(structuredClone(ray));
            const result = parseSceneRadianceEvaluationResult(apertureRay === undefined ? evaluate(request) : aperture!(request, apertureRay));
            if (result.sampleId !== request.sampleId || result.providerProfileId !== request.providerProfileId || result.sceneId !== request.sceneId ||
              result.wavelengthNanometers !== request.wavelengthNanometers || result.wavelengthBasis !== request.wavelengthBasis) {
              validateSceneRadianceEvaluationBindings({ ...k.sceneBindings, request, result });
            }
            let irradiance = result.spectralRadianceWattsPerSquareMeterSteradianNanometer * (c.acceptance[s]! * tap.fieldFactor);
            if (!tap.fieldValid || !Number.isFinite(irradiance) || irradiance < 0) {
              irradiance = calculateSceneRadianceToSensorIrradiance({ ...(optics as Parameters<typeof calculateSceneRadianceToSensorIrradiance>[0]),
                sceneRadianceRequest: request, sceneRadianceResult: result, imagePointMm: tap.sourcePointImagePlaneMm,
                fieldThroughput: tap.fieldThroughput }).value.sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer;
            }
            integrated += irradiance * (ray?.weight ?? 1);
          }
          v[gi] = integrated;
        }
        values.push(v);
        times.push(instant.time);
      }
      return photo(k, c, values, environment, plan.site, plan.start, plan.end, plan.duration, times) ??
        createSensorEqeTemporalPhotoSignal(fullPhotoInput(k, values, environment, times)).value.photoSignal;
    }
  };
}

function approximatelyEqual(actual: number, expected: number): boolean {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  return Math.abs(actual - expected) <= REDUCTION_TOLERANCE * scale;
}
