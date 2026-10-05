// SPDX-License-Identifier: Apache-2.0
/** Repository-only explicit ideal-emission factorization; never inferred for an arbitrary provider. */
import { planEnvironmentSensorPhotoSignal, executeEnvironmentSensorPhotoSignal,
  type CalculateEnvironmentSensorPhotoSignalInput } from "../sensor/environment-photo-signal.js";
import { parseSceneRadianceEvaluationRequest, type SceneRadianceEvaluationRequest } from "../schema/scene-radiance.js";
import { parseEvidenceList, type EvidenceProvenance } from "../core/evidence-provenance.js";
import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { stringifyCanonicalJson } from "../core/canonical-json.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type { SensorApertureRay } from "../optics/sensor-aperture-rays.js";

export interface SeparableEmissionContract {
  schemaVersion: "0.1.0";
  kind: "uniform-spectrum-achromatic-ideal-emission";
  providerProfileId: string;
  sceneId: string;
  illuminationProfileId: string;
  materialResponseProfileId: string;
  wavelengthBasis: "air" | "vacuum";
  /** Explicit linear-interpolated spectral radiance, W/m²/sr/nm; no extrapolation. */
  spectrum: readonly { wavelengthNanometers: number; spectralRadianceWattsPerSquareMeterSteradianNanometer: number }[];
  evidence: readonly EvidenceProvenance[];
  limitation: string;
}
/** Geometry callback cannot observe wavelength or sample IDs. Time and origin remain exact. */
export type SeparableEmissionGeometryRequest = Omit<SceneRadianceEvaluationRequest,
  "sampleId" | "wavelengthNanometers" | "wavelengthBasis"> & { apertureRay: Readonly<SensorApertureRay> };
export interface SeparableEmissionWork {
  geometryEvaluationCount: number;
  spectralCompositionCount: number;
  /** Actual source geometry is caller-owned, unverified and approximation-only. */
  sourceSeparabilityVerified: false;
}

/**
 * Bounded single-site draft composition. Reuses each exact geometric ray/time once across
 * explicitly supported wavelength nodes. All optical/EQE nodes and weights remain executed.
 * Native admission and its existing provider budgets are deliberately unchanged.
 */
export function planSeparableEmissionPhotoSignal(
  input: Omit<CalculateEnvironmentSensorPhotoSignalInput, "evaluateRadiance" | "evaluateApertureRadiance">,
  contract: SeparableEmissionContract
): {plan:ReturnType<typeof planEnvironmentSensorPhotoSignal>;owned:SeparableEmissionContract;evidence:readonly EvidenceProvenance[];spectralValues:Map<number,number>} {
  requireAllowlistedRecord(contract,["schemaVersion","kind","providerProfileId","sceneId","illuminationProfileId","materialResponseProfileId","wavelengthBasis","spectrum","evidence","limitation"],"Invalid separable emission contract.");
  const owned = structuredClone(contract);
  if (owned.schemaVersion !== "0.1.0" || owned.kind !== "uniform-spectrum-achromatic-ideal-emission" ||
    !["air","vacuum"].includes(owned.wavelengthBasis) || typeof owned.limitation !== "string" || !owned.limitation.trim() ||
    !Array.isArray(owned.spectrum) || owned.spectrum.length < 2 || owned.spectrum.length > 4096)
    throw new InvalidScientificInputError("Separable emission requires explicit achromatic geometry, uniform spectrum and limitations.");
  for (const key of ["providerProfileId","sceneId","illuminationProfileId","materialResponseProfileId"] as const)
    requirePublicOpaqueId(owned[key],"Invalid separable emission binding.");
  const evidence = parseEvidenceList(owned.evidence,"separableEmission.evidence");
  let previous = 0;
  for (const point of owned.spectrum) {
    requireAllowlistedRecord(point,["wavelengthNanometers","spectralRadianceWattsPerSquareMeterSteradianNanometer"],"Invalid emitter spectrum point.");
    if (!Number.isFinite(point.wavelengthNanometers) || point.wavelengthNanometers <= previous ||
      !Number.isFinite(point.spectralRadianceWattsPerSquareMeterSteradianNanometer) || point.spectralRadianceWattsPerSquareMeterSteradianNanometer < 0)
      throw new InvalidScientificInputError("Emitter spectrum must be finite, nonnegative and strictly wavelength ordered.");
    previous = point.wavelengthNanometers;
  }
  const plan = planEnvironmentSensorPhotoSignal(input);
  if (!plan.owned.pupil || plan.owned.psf.kind !== "not-applied")
    throw new InvalidScientificInputError("Separable emission currently requires ideal pupil geometry without sampled PSF.");
  const spectralValues = new Map<number,number>();
  for (const instant of plan.instants) for (const group of instant.groups) for (const tap of group.taps) {
    const q = parseSceneRadianceEvaluationRequest(tap.query.value.request);
    for (const key of ["providerProfileId","sceneId","illuminationProfileId","materialResponseProfileId","wavelengthBasis"] as const)
      if (q[key] !== owned[key]) throw new InvalidScientificInputError("Separable emission identity or wavelength basis mismatch.");
    const wavelength = q.wavelengthNanometers;
    if (wavelength < owned.spectrum[0]!.wavelengthNanometers || wavelength > owned.spectrum.at(-1)!.wavelengthNanometers)
      throw new InvalidScientificInputError("Separable emission spectrum does not cover every original wavelength node.");
    const hi = owned.spectrum.findIndex(p => p.wavelengthNanometers >= wavelength), b = owned.spectrum[hi]!, a = owned.spectrum[Math.max(0,hi-1)]!;
    const t = a === b ? 0 : (wavelength-a.wavelengthNanometers)/(b.wavelengthNanometers-a.wavelengthNanometers);
    spectralValues.set(wavelength,a.spectralRadianceWattsPerSquareMeterSteradianNanometer+(b.spectralRadianceWattsPerSquareMeterSteradianNanometer-a.spectralRadianceWattsPerSquareMeterSteradianNanometer)*t);
  }
  return {plan,owned,evidence,spectralValues};
}
/** Internal prepared executor; callbacks cannot change the owned source contract. */
export function executeSeparableEmissionPhotoSignal(
 prepared:ReturnType<typeof planSeparableEmissionPhotoSignal>,
 evaluateGeometry:(request:Readonly<SeparableEmissionGeometryRequest>)=>number,
 signal?:AbortSignal,
 observeWork?:(kind:"geometry"|"spectral")=>void
): {photoSignal:ReturnType<typeof executeEnvironmentSensorPhotoSignal>;work:SeparableEmissionWork} {
  if(typeof evaluateGeometry!=="function")throw new InvalidScientificInputError("Separable emission requires callable geometry.");
  const {plan,owned,evidence,spectralValues}=prepared;
  const cache = new Map<string,number>();
  let geometryEvaluationCount = 0, spectralCompositionCount = 0;
  const photoSignal = executeEnvironmentSensorPhotoSignal(plan,()=>{throw new InvalidScientificInputError("Separable emission requires origin-aware pupil execution.");},(request,ray)=>{
    if (signal?.aborted) throw new InvalidScientificInputError("Separable emission canceled.");
    const {sampleId,wavelengthNanometers,wavelengthBasis,...geometry} = request;
    const geometricRequest = freezeOwnedData({...geometry,apertureRay:structuredClone(ray)});
    const key = stringifyCanonicalJson(geometricRequest,{undefinedObjectProperties:"omit",nonFiniteNumberMessage:"Invalid emission geometry.",unsupportedValueMessage:"Invalid emission geometry."});
    let factor = cache.get(key);
    if (factor === undefined) {
      geometryEvaluationCount++;observeWork?.("geometry");
      factor = evaluateGeometry(geometricRequest);
      if (signal?.aborted) throw new InvalidScientificInputError("Separable emission canceled.");
      if (typeof factor !== "number" || !Number.isFinite(factor) || factor < 0)
        throw new InvalidScientificInputError("Ideal-emission geometry must return a finite nonnegative dimensionless multiplier.");
      cache.set(key,factor);
    }
    spectralCompositionCount++;observeWork?.("spectral");
    return {schemaVersion:"0.1.0",sampleId,providerProfileId:request.providerProfileId,sceneId:request.sceneId,
      wavelengthNanometers,wavelengthBasis,quantity:"outgoing-spectral-radiance",unit:"W/m^2/sr/nm",
      spectralRadianceWattsPerSquareMeterSteradianNanometer:factor*spectralValues.get(wavelengthNanometers)!,
      scientificStatus:"approximation",uncertainty:{kind:"not-quantified",limitation:owned.limitation},evidence,
      limitations:[owned.limitation,"Explicit caller-declared uniform emitter spectrum and achromatic geometry; separability and transport are unverified."]};
  });
  return {photoSignal,work:{geometryEvaluationCount,spectralCompositionCount,sourceSeparabilityVerified:false}};
}

/** Bounded single-site composition. Native capture budgets remain independently enforced. */
export function calculateSeparableEmissionPhotoSignal(
 input:Omit<CalculateEnvironmentSensorPhotoSignalInput,"evaluateRadiance"|"evaluateApertureRadiance">,
 contract:SeparableEmissionContract,
 evaluateGeometry:(request:Readonly<SeparableEmissionGeometryRequest>)=>number,
 signal?:AbortSignal
):ReturnType<typeof executeSeparableEmissionPhotoSignal> {
 return executeSeparableEmissionPhotoSignal(planSeparableEmissionPhotoSignal(input,contract),evaluateGeometry,signal);
}
