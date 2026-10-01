// SPDX-License-Identifier: Apache-2.0

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { calculateIlluminationVignetting, type IlluminationVignettingProfile } from "../optics/illumination-vignetting.js";
import {
  choice, finite, list, parseEvidence, parseOpticalProfileState, positive, record,
  requireSameState, textValue, type GenericOpticalEvidence, type OpticalProfileState
} from "../optics/profile-contract.js";
import type { LensFieldPointMm } from "../optics/radial-distortion.js";
import {
  calculateGeometricResampling, calculateGeometricSamplingPlan, parseDigitalGeometricTransform,
  prepareGeometricMapping, parseGeometricRaster, calculateValidSourceCrop, type DigitalGeometricTransform, type GeometricImageDomain,
  type GeometricRaster, type GeometricResampler, type GeometricSamplingPlan
} from "./geometric-transforms.js";

export type LensCorrectionChannel = "red" | "green" | "blue";
interface CorrectionComponentIdentity {
  id: string;
  version: string;
  domain: GeometricImageDomain;
  availability: "toggle" | "automatic" | "mandatory";
  defaultEnabled: boolean;
  dependencies: readonly string[];
  requiredByStabilizationModes: readonly string[];
  /** Declared residual/calibration limitations; not inferred from optical tier. */
  residualNote: string;
}
/** A separately declared correction map may deliberately retain physical distortion. */
export interface GeometricLensCorrection extends CorrectionComponentIdentity {
  kind: "geometry";
  transform: DigitalGeometricTransform;
}
/** Channel registration only, not longitudinal CA or color shading. */
export interface LateralCaLensCorrection extends CorrectionComponentIdentity {
  kind: "lateral-ca";
  transforms: Readonly<Record<LensCorrectionChannel, DigitalGeometricTransform>>;
}
/** Post-capture scalar gain; strength 0..1 leaves explicit residual falloff. */
export interface IlluminationLensCorrection extends CorrectionComponentIdentity {
  kind: "peripheral-illumination";
  profile: IlluminationVignettingProfile;
  strength: number;
}
export type LensCorrectionComponent = GeometricLensCorrection | LateralCaLensCorrection | IlluminationLensCorrection;
/** Exact generic system binding, with components in authoritative application order. */
export interface GenericLensCorrectionProfile {
  schemaVersion: "0.1.0";
  id: string;
  version: string;
  state: OpticalProfileState;
  evidence: GenericOpticalEvidence;
  components: readonly LensCorrectionComponent[];
}
export interface ResolvedLensCorrectionPlan {
  profile: GenericLensCorrectionProfile;
  outputKind: "raw-like" | "processed";
  selectionKind: "camera-selectable" | "reference-bypass";
  components: readonly { component: LensCorrectionComponent; enabled: boolean;
    reason: "selected" | "default" | "mandatory" | "stabilization-dependency" | "component-dependency" | "reference-bypass" }[];
  /** RAW-like intent remains metadata only in this first foundation. */
  application: "metadata-only" | "bake-downstream";
}
function illumination(value: unknown): IlluminationVignettingProfile {
  const r = record(value, ["normalizationRadiusMm", "maximumNormalizedRadius", "coefficients"]);
  const c = record(r.coefficients, ["r2", "r4", "r6"]);
  const profile = { normalizationRadiusMm: positive(r.normalizationRadiusMm, "normalizationRadiusMm"),
    maximumNormalizedRadius: positive(r.maximumNormalizedRadius, "maximumNormalizedRadius"),
    coefficients: { r2: finite(c.r2, "r2"), r4: finite(c.r4, "r4"), r6: finite(c.r6, "r6") } };
  calculateIlluminationVignetting({ imagePointMm: { x: 0, y: 0 }, profile });
  return profile;
}
/** Strict parser for generic system corrections; no extrapolation or restoration claim. */
export function parseGenericLensCorrectionProfile(value: unknown): GenericLensCorrectionProfile {
  const r = record(value, ["schemaVersion", "id", "version", "state", "evidence", "components"]);
  const components = list(r.components, 16).map((value): LensCorrectionComponent => {
    const c = record(value, ["id", "version", "domain", "availability", "defaultEnabled", "dependencies",
      "requiredByStabilizationModes", "residualNote", "kind", "transform", "transforms", "profile", "strength"]);
    if (typeof c.defaultEnabled !== "boolean") throw new InvalidScientificInputError("defaultEnabled must be boolean.");
    const identity = { id: textValue(c.id), version: textValue(c.version),
      domain: choice(c.domain, ["raw-channel", "reconstructed-linear", "processed-output"]),
      availability: choice(c.availability, ["toggle", "automatic", "mandatory"]), defaultEnabled: c.defaultEnabled,
      dependencies: list(c.dependencies, 16).map(textValue),
      requiredByStabilizationModes: list(c.requiredByStabilizationModes, 16).map(textValue), residualNote: textValue(c.residualNote) };
    const kind = choice(c.kind, ["geometry", "lateral-ca", "peripheral-illumination"]);
    if (kind === "geometry") {
      if (c.transforms !== undefined || c.profile !== undefined || c.strength !== undefined) throw new InvalidScientificInputError("Extraneous geometry parameters.");
      const transform = parseDigitalGeometricTransform(c.transform);
      if (transform.domain !== identity.domain || !["distortion", "breathing"].includes(transform.purpose)) throw new InvalidScientificInputError("Geometry domain/purpose mismatch.");
      return { ...identity, kind, transform };
    }
    if (kind === "lateral-ca") {
      if (c.transform !== undefined || c.profile !== undefined || c.strength !== undefined) throw new InvalidScientificInputError("Extraneous CA parameters.");
      const t = record(c.transforms, ["red", "green", "blue"]);
      const transforms = { red: parseDigitalGeometricTransform(t.red), green: parseDigitalGeometricTransform(t.green), blue: parseDigitalGeometricTransform(t.blue) };
      for (const transform of Object.values(transforms)) {
        if (transform.domain !== identity.domain || transform.purpose !== "lateral-ca") throw new InvalidScientificInputError("CA domain/purpose mismatch.");
      }
      return { ...identity, kind, transforms };
    }
    if (c.transform !== undefined || c.transforms !== undefined) throw new InvalidScientificInputError("Extraneous illumination geometry.");
    const strength = finite(c.strength, "strength");
    if (strength < 0 || strength > 1) throw new InvalidScientificInputError("Strength must lie in [0,1].");
    return { ...identity, kind, profile: illumination(c.profile), strength };
  });
  const preceding = new Set<string>(), mappingIds = new Set<string>();
  for (const c of components) {
    if (preceding.has(c.id) || c.dependencies.some((id) => !preceding.has(id)) ||
        new Set(c.dependencies).size !== c.dependencies.length) throw new InvalidScientificInputError("Component IDs/dependency order must be unique and acyclic.");
    preceding.add(c.id);
    // Common and per-channel transforms need stable distinct IDs when fused.
    const maps = c.kind === "geometry" ? [c.transform] : c.kind === "lateral-ca" ? Object.values(c.transforms) : [];
    for (const t of maps) {
      if (mappingIds.has(t.id)) throw new InvalidScientificInputError("Duplicate correction transform ID.");
      mappingIds.add(t.id);
    }
  }
  return { schemaVersion: choice(r.schemaVersion, ["0.1.0"]), id: textValue(r.id), version: textValue(r.version),
    state: parseOpticalProfileState(r.state), evidence: parseEvidence(r.evidence), components };
}

/** Resolves independent camera states, explicit dependencies, RAW intent and educational bypass. */
export function resolveLensCorrectionPlan(input: {
  profile: GenericLensCorrectionProfile; state: OpticalProfileState;
  selections: Readonly<Record<string, "on" | "off" | "auto">>;
  outputKind: "raw-like" | "processed"; selectionKind: "camera-selectable" | "reference-bypass";
}): CalculationResult<ResolvedLensCorrectionPlan> {
  const profile = parseGenericLensCorrectionProfile(input.profile);
  requireSameState(profile.state, input.state);
  const outputKind = choice(input.outputKind, ["raw-like", "processed"]);
  const selectionKind = choice(input.selectionKind, ["camera-selectable", "reference-bypass"]);
  const selections = record(input.selections, profile.components.map((c) => c.id));
  const components: ResolvedLensCorrectionPlan["components"][number][] = profile.components.map((c): ResolvedLensCorrectionPlan["components"][number] => {
    const selection = choice(selections[c.id] ?? "auto", ["on", "off", "auto"]);
    if (selectionKind === "reference-bypass") return { component: c, enabled: false, reason: "reference-bypass" };
    const stabilization = c.requiredByStabilizationModes.includes(profile.state.stabilizationMode);
    if (c.availability === "mandatory" && selection === "off") throw new InvalidScientificInputError("Mandatory correction cannot be disabled as a camera setting; use reference-bypass.");
    if (c.availability === "automatic" && selection !== "auto") throw new InvalidScientificInputError("Automatic correction has no camera toggle.");
    return { component: c, enabled: c.availability === "mandatory" || stabilization || (selection === "auto" ? c.defaultEnabled : selection === "on"),
      reason: c.availability === "mandatory" ? "mandatory" : stabilization ? "stabilization-dependency" : selection === "auto" ? "default" : "selected" };
  });
  for (const entry of [...components].reverse()) if (entry.enabled) for (const id of entry.component.dependencies) {
    const dependency = components.find((c) => c.component.id === id)!;
    dependency.enabled = true; dependency.reason = "component-dependency";
  }
  return approximationResult({ profile, outputKind, selectionKind, components,
    application: outputKind === "raw-like" ? "metadata-only" : "bake-downstream" },
  "generic-camera-lens-correction-plan", "0.1.0", [profile.evidence.basis, profile.evidence.residualNote,
    "Corrections occur after the same physical capture; tier is not a correction-strength input",
    "Raw-like output preserves intent without baking corrections; color shading, axial CA and restoration remain unsupported"]);
}

/** Applies scalar post-capture gain and reports pre-clip variance; no photon/SNR history rewrite. */
export function calculatePeripheralIlluminationCorrection(input: {
  component: IlluminationLensCorrection; imagePointMm: LensFieldPointMm;
  signal: number; noiseVariance: number; clippingLevel: number;
}): CalculationResult<{ gain: number; signalBeforeClipping: number; signal: number; noiseVarianceBeforeClipping: number; clipped: boolean }> {
  const component = input.component;
  if (component.kind !== "peripheral-illumination" || component.strength < 0 || component.strength > 1 || !Number.isFinite(component.strength)) throw new InvalidScientificInputError("Invalid illumination component.");
  const signal = finite(input.signal, "signal"), variance = finite(input.noiseVariance, "noiseVariance");
  const level = positive(input.clippingLevel, "clippingLevel");
  if (variance < 0) throw new InvalidScientificInputError("Variance must be nonnegative.");
  const throughput = calculateIlluminationVignetting({ imagePointMm: input.imagePointMm, profile: component.profile }).value.linearThroughputFactor;
  const gain = throughput**(-component.strength), before = signal*gain;
  return approximationResult({ gain, signalBeforeClipping: before, signal: Math.min(level, before),
    noiseVarianceBeforeClipping: variance*gain*gain, clipped: before > level },
    "post-capture-peripheral-illumination-gain", "0.1.0", ["Variance describes pre-clip samples only", "Gain does not increase captured photons or restore sensor SNR"]);
}

/** Immutable capture identity accompanies downstream channels for meaningful On/Off comparisons. */
export interface LensCorrectionCapture {
  state: OpticalProfileState;
  captureId: string;
  noiseRealizationId: string;
  timeSeconds: number;
  raster: GeometricRaster;
  channels: Readonly<Record<LensCorrectionChannel, readonly number[]>>;
}
/** Executes bounded reconstructed-linear corrections on already sampled RGB channels.
 * Compatible common geometry plus channel CA is sampled once per channel.
 * A gain between geometry components or incompatible domains requires an external staged consumer.
 */
export function calculateLensCorrectedCapture(input: {
  plan: ResolvedLensCorrectionPlan; capture: LensCorrectionCapture;
  destinationRaster: GeometricRaster; resampler: GeometricResampler;
  physicalProjectionDistanceMm: number; clippingLevel: number;
}): CalculationResult<{
  captureId: string; noiseRealizationId: string; timeSeconds: number;
  application: ResolvedLensCorrectionPlan["application"];
  channels: Readonly<Record<LensCorrectionChannel, readonly (number | null)[]>>;
  samplingPlans: Partial<Record<LensCorrectionChannel, GeometricSamplingPlan>>;
  /** Intersection across all channel footprints, before crop; no missing colors fabricated. */
  validSourceMask: readonly boolean[];
  jointCrop: GeometricSamplingPlan["jointCrop"];
}> {
  // Re-resolve untrusted/mutated plans; callers cannot forge enabled/mandatory state.
  const plan = resolveLensCorrectionPlan({ profile: input.plan.profile, state: input.plan.profile.state,
    selections: Object.fromEntries(input.plan.components.filter((e) => e.component.availability === "toggle").map((e) => [e.component.id, e.enabled ? "on" : "off"])),
    outputKind: input.plan.outputKind, selectionKind: input.plan.selectionKind }).value;
  const capture = input.capture;
  requireSameState(plan.profile.state, capture.state);
  parseGeometricRaster(capture.raster);
  const destination = parseGeometricRaster(input.destinationRaster);
  if (destination.width !== plan.profile.state.outputWidth || destination.height !== plan.profile.state.outputHeight) {
    throw new InvalidScientificInputError("Destination raster differs from correction output binding.");
  }
  textValue(capture.captureId); textValue(capture.noiseRealizationId);
  if (finite(capture.timeSeconds, "timeSeconds") < 0) throw new InvalidScientificInputError("Invalid capture time.");
  const count = capture.raster.width*capture.raster.height;
  for (const channel of ["red", "green", "blue"] as const) {
    const data = list(capture.channels[channel], 65536);
    if (data.length !== count) throw new InvalidScientificInputError("Capture channel sample count mismatch.");
    data.forEach((s) => finite(s, "channel sample"));
  }
  const active = plan.components.filter((e) => e.enabled).map((e) => e.component);
  if (plan.application === "metadata-only" || !active.length) {
    return approximationResult({ captureId: capture.captureId, noiseRealizationId: capture.noiseRealizationId,
      timeSeconds: capture.timeSeconds, application: plan.application, channels: capture.channels,
      samplingPlans: {}, validSourceMask: Array<boolean>(count).fill(true),
      jointCrop: { x: 0, y: 0, width: capture.raster.width, height: capture.raster.height } },
    "generic-lens-correction-capture", "0.1.0", ["Original physical capture preserved"]);
  }
  if (active.some((c) => c.domain !== "reconstructed-linear")) throw new InvalidScientificInputError("This executor requires reconstructed-linear components; other domains need separate consumers.");
  let seenGain = false;
  for (const c of active) {
    if (c.kind === "peripheral-illumination") seenGain = true;
    else if (seenGain) throw new InvalidScientificInputError("Cannot reorder geometry across a gain stage.");
  }
  const channels = {} as Record<LensCorrectionChannel, readonly (number | null)[]>;
  const samplingPlans: Partial<Record<LensCorrectionChannel, GeometricSamplingPlan>> = {};
  for (const channel of ["red", "green", "blue"] as const) {
    // Application order source->destination reverses for inverse sampling.
    const transforms = active.filter((c) => c.kind !== "peripheral-illumination").reverse().map((c) =>
      c.kind === "geometry" ? c.transform : (c as LateralCaLensCorrection).transforms[channel]);
    const mapping = prepareGeometricMapping({ transforms, frameTimeSeconds: capture.timeSeconds }).value;
    const sampling = calculateGeometricSamplingPlan({ mapping, sourceRaster: capture.raster,
      destinationRaster: input.destinationRaster, resampler: input.resampler,
      physicalProjectionDistanceMm: input.physicalProjectionDistanceMm }).value;
    samplingPlans[channel] = sampling;
    let data = calculateGeometricResampling({ plan: sampling, sourceSamples: capture.channels[channel] }).value.samples;
    for (const c of active) if (c.kind === "peripheral-illumination") {
      data = data.map((signal, index): number | null => {
        if (signal === null) return null;
        const raster = input.destinationRaster, x = index%raster.width, y = Math.floor(index/raster.width);
        return calculatePeripheralIlluminationCorrection({ component: c,
          imagePointMm: { x: raster.centerMm.x+(x+.5-raster.width/2)*raster.pitchMm,
            y: raster.centerMm.y-(y+.5-raster.height/2)*raster.pitchMm },
          signal, noiseVariance: 0, clippingLevel: input.clippingLevel }).value.signal;
      });
    }
    channels[channel] = data;
  }
  const mask = channels.red.map((_, i) => channels.red[i] !== null && channels.green[i] !== null && channels.blue[i] !== null);
  for (const channel of ["red", "green", "blue"] as const) channels[channel] = channels[channel].map((s, i) => mask[i] ? s : null);
  return approximationResult({ captureId: capture.captureId, noiseRealizationId: capture.noiseRealizationId,
    timeSeconds: capture.timeSeconds, application: plan.application, channels, samplingPlans, validSourceMask: mask,
    jointCrop: calculateValidSourceCrop(mask, destination.width, destination.height) },
  "generic-lens-correction-capture", "0.1.0", ["Input capture/noise realization remains unchanged", "Channel support intersects before output; optical blur/noise is warped, not physically repaired",
    "No production-plan composition is enabled by this standalone executor"]);
}
