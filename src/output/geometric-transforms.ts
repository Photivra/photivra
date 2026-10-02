// SPDX-License-Identifier: Apache-2.0

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  calculateRadialDistortionMapping, calculateInverseRadialDistortionMapping,
  validateRadialDistortionProfile, type RadialDistortionProfile, type LensFieldPointMm
} from "../optics/radial-distortion.js";
import { choice, finite, list, positive, record, textValue } from "../optics/profile-contract.js";

/** Domains are barriers: only contiguous equal-domain maps share a resample. */
export type GeometricImageDomain = "raw-channel" | "reconstructed-linear" | "processed-output";
/** Row-major derivative d(source mm)/d(destination mm). */
export type GeometricJacobian = readonly [number, number, number, number];
interface TransformIdentity {
  id: string;
  version: string;
  domain: GeometricImageDomain;
  purpose: "distortion" | "breathing" | "digital-stabilization" | "orientation-crop" | "lateral-ca";
}
/** Explicit destination-to-source affine map, including rotation/shear/offset. */
export interface AffineGeometricTransform extends TransformIdentity {
  kind: "affine";
  matrix: GeometricJacobian;
  offsetMm: LensFieldPointMm;
}
/** Correction samples physical distorted data at the mapped ideal destination. */
export interface RadialGeometricTransform extends TransformIdentity {
  kind: "radial";
  profile: RadialDistortionProfile;
}
export type DigitalGeometricTransform = AffineGeometricTransform | RadialGeometricTransform;
/** Serializable prepared state. Maps are applied in listed destination-to-source order. */
export interface PreparedGeometricMapping {
  schemaVersion: "0.1.0";
  frameTimeSeconds: number;
  transforms: readonly DigitalGeometricTransform[];
  semanticKey: string;
  groups: readonly { domain: GeometricImageDomain; componentIds: readonly string[] }[];
}
/** Regular pixel centers on the optical plane: +X right, +Y up; row order down. */
export interface GeometricRaster {
  width: number;
  height: number;
  centerMm: LensFieldPointMm;
  pitchMm: number;
}
/** Resampler identity is independent of mapping. Prefiltering is a caller obligation. */
export interface GeometricResampler {
  id: string;
  version: string;
  filter: "nearest" | "bilinear";
  antialias: "none" | "source-prefiltered";
}
export interface GeometricMappingPoint {
  sourcePointMm: LensFieldPointMm;
  jacobian: GeometricJacobian;
  determinant: number;
  principalStretches: readonly [number, number];
  anisotropy: number;
  components: readonly { id: string; sourcePointMm: LensFieldPointMm; jacobian: GeometricJacobian }[];
}
export interface GeometricSamplingPlan {
  mapping: PreparedGeometricMapping;
  sourceRaster: GeometricRaster;
  destinationRaster: GeometricRaster;
  resampler: GeometricResampler;
  points: readonly GeometricMappingPoint[];
  /** Includes exact center-domain support for the selected filter; no edge extension. */
  validSourceMask: readonly boolean[];
  /** Largest all-valid axis-aligned pixel rectangle, half-open. Null if empty. */
  jointCrop: { x: number; y: number; width: number; height: number } | null;
  requiresPrefilter: boolean;
  canResample: boolean;
  physicalCapturedFovDegrees: { horizontal: number; vertical: number };
  /** Envelope of mapped pixel-center rays retained by the joint crop, not edge FOV. */
  retainedSampleRayEnvelopeDegrees: { minX: number; maxX: number; minY: number; maxY: number } | null;
}

function point(value: unknown): LensFieldPointMm {
  const p = record(value, ["x", "y"]);
  return { x: finite(p.x, "x"), y: finite(p.y, "y") };
}
function multiply(a: GeometricJacobian, b: GeometricJacobian): GeometricJacobian {
  return [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3],
    a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3]];
}
function determinant(m: GeometricJacobian): number { return m[0]*m[3]-m[1]*m[2]; }
function inverse(m: GeometricJacobian): GeometricJacobian {
  const d = determinant(m);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12) throw new InvalidScientificInputError("Singular or ill-conditioned affine map.");
  return [m[3]/d, -m[1]/d, -m[2]/d, m[0]/d];
}
function affine(p: LensFieldPointMm, m: GeometricJacobian, o: LensFieldPointMm): LensFieldPointMm {
  return { x: m[0]*p.x+m[1]*p.y+o.x, y: m[2]*p.x+m[3]*p.y+o.y };
}
/** Parses strict transform data, rejecting unknown semantics and noninvertible profiles. */
export function parseDigitalGeometricTransform(value: unknown): DigitalGeometricTransform {
  const r = record(value, ["id", "version", "domain", "purpose", "kind", "matrix", "offsetMm", "profile"]);
  const identity = {
    id: textValue(r.id), version: textValue(r.version),
    domain: choice(r.domain, ["raw-channel", "reconstructed-linear", "processed-output"]),
    purpose: choice(r.purpose, ["distortion", "breathing", "digital-stabilization", "orientation-crop", "lateral-ca"])
  };
  const kind = choice(r.kind, ["affine", "radial"]);
  if (kind === "affine") {
    if (r.profile !== undefined) throw new InvalidScientificInputError("Affine map cannot contain radial profile.");
    const entries = list(r.matrix, 4).map((v) => finite(v, "matrix"));
    if (entries.length !== 4) throw new InvalidScientificInputError("Matrix must have four entries.");
    const matrix = entries as [number, number, number, number];
    inverse(matrix);
    return { ...identity, kind, matrix, offsetMm: point(r.offsetMm) };
  }
  if (r.matrix !== undefined || r.offsetMm !== undefined) throw new InvalidScientificInputError("Radial map cannot contain affine fields.");
  const p = record(r.profile, ["normalizationRadiusMm", "maximumNormalizedRadius", "coefficients"]);
  const c = record(p.coefficients, ["k1", "k2", "k3"]);
  const profile = { normalizationRadiusMm: positive(p.normalizationRadiusMm, "normalizationRadiusMm"),
    maximumNormalizedRadius: positive(p.maximumNormalizedRadius, "maximumNormalizedRadius"),
    coefficients: { k1: finite(c.k1, "k1"), k2: finite(c.k2, "k2"), k3: finite(c.k3, "k3") } };
  validateRadialDistortionProfile(profile);
  return { ...identity, kind, profile };
}

/** Prepares deterministic still/frame geometry; time changes require another preparation. */
export function prepareGeometricMapping(input: {
  transforms: readonly DigitalGeometricTransform[]; frameTimeSeconds: number;
}): CalculationResult<PreparedGeometricMapping> {
  const time = finite(input.frameTimeSeconds, "frameTimeSeconds");
  if (time < 0) throw new InvalidScientificInputError("Time is seconds from exposure start.");
  const transforms = list(input.transforms, 32).map(parseDigitalGeometricTransform);
  if (new Set(transforms.map((t) => t.id)).size !== transforms.length) throw new InvalidScientificInputError("Duplicate transform IDs.");
  const groups: { domain: GeometricImageDomain; componentIds: string[] }[] = [];
  for (const t of transforms) {
    const last = groups.at(-1);
    if (last?.domain === t.domain) last.componentIds.push(t.id);
    else groups.push({ domain: t.domain, componentIds: [t.id] });
  }
  return approximationResult({ schemaVersion: "0.1.0", frameTimeSeconds: time, transforms,
    semanticKey: JSON.stringify({ frameTimeSeconds: time, transforms }), groups },
  "composed-digital-geometry", "0.1.0", ["Explicit inverse maps; incompatible domains require separate image stages", "No physical PSF, photon or noise-history recalculation"]);
}

/** Authoritative display-to-capture map and full local directional derivatives. */
export function calculateComposedGeometricMapping(input: {
  mapping: PreparedGeometricMapping; destinationPointMm: LensFieldPointMm;
}): CalculationResult<GeometricMappingPoint> {
  const mapping = prepareGeometricMapping(input.mapping).value;
  return calculatePreparedGeometricMappingPoint(mapping, input.destinationPointMm);
}

/** Call-local parsed/copy-owned mapping only; never accepts external prepared state. */
function calculatePreparedGeometricMappingPoint(
  mapping: PreparedGeometricMapping,
  destinationPointMm: LensFieldPointMm
): CalculationResult<GeometricMappingPoint> {
  let p = point(destinationPointMm);
  let j: GeometricJacobian = [1, 0, 0, 1];
  const components: GeometricMappingPoint["components"][number][] = [];
  for (const t of mapping.transforms) {
    let local: GeometricJacobian;
    if (t.kind === "affine") {
      // Preserve independent result arrays when one mapping serves many points.
      local = [...t.matrix];
      p = affine(p, local, t.offsetMm);
    } else {
      const { k1, k2, k3 } = t.profile.coefficients;
      const r2 = (p.x*p.x+p.y*p.y)/t.profile.normalizationRadiusMm**2;
      const s = 1+k1*r2+k2*r2*r2+k3*r2*r2*r2;
      const d = 2*(k1+2*k2*r2+3*k3*r2*r2)/t.profile.normalizationRadiusMm**2;
      local = [s+d*p.x*p.x, d*p.x*p.y, d*p.x*p.y, s+d*p.y*p.y];
      p = calculateRadialDistortionMapping({ imagePointMm: p, profile: t.profile }).value.mappedImagePointMm;
    }
    j = multiply(local, j);
    components.push({ id: t.id, sourcePointMm: { ...p }, jacobian: local });
  }
  // Singular values via the symmetric J^T J eigenproblem. det/smax avoids cancellation at smin.
  const a = j[0]*j[0]+j[2]*j[2], b = j[0]*j[1]+j[2]*j[3], c = j[1]*j[1]+j[3]*j[3];
  const maximum = Math.sqrt((a+c+Math.hypot(a-c, 2*b))/2);
  const det = determinant(j), minimum = Math.abs(det)/maximum;
  return approximationResult({ sourcePointMm: p, jacobian: j, determinant: det,
    principalStretches: [maximum, minimum], anisotropy: maximum/minimum, components },
  "composed-digital-geometry-point", "0.1.0", ["Jacobian warps already-formed blur and noise; it creates no captured detail"]);
}

/** Capture-to-display bridge for focus, metering and overlays; reverses the same maps. */
export function calculateForwardGeometricMapping(input: {
  mapping: PreparedGeometricMapping; sourcePointMm: LensFieldPointMm;
}): CalculationResult<LensFieldPointMm> {
  let p = point(input.sourcePointMm);
  const mapping = prepareGeometricMapping(input.mapping).value;
  for (const t of [...mapping.transforms].reverse()) {
    p = t.kind === "affine"
      ? affine({ x: p.x-t.offsetMm.x, y: p.y-t.offsetMm.y }, inverse(t.matrix), { x: 0, y: 0 })
      : calculateInverseRadialDistortionMapping({ distortedImagePointMm: p, profile: t.profile }).value.sourceImagePointMm;
  }
  return approximationResult(p, "forward-digital-geometry-bridge", "0.1.0", ["Inverse of the authoritative destination-to-source geometry"]);
}

/** @internal Shared lattice validation for downstream correction consumers. */
export function parseGeometricRaster(value: unknown): GeometricRaster {
  const r = record(value, ["width", "height", "centerMm", "pitchMm"]);
  const width = positive(r.width, "width"), height = positive(r.height, "height");
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width*height > 65536) {
    throw new InvalidScientificInputError("Raster must have at most 65536 integral samples.");
  }
  return { width, height, centerMm: point(r.centerMm), pitchMm: positive(r.pitchMm, "pitchMm") };
}
function pixelPoint(r: GeometricRaster, x: number, y: number): LensFieldPointMm {
  return { x: r.centerMm.x+(x+.5-r.width/2)*r.pitchMm, y: r.centerMm.y-(y+.5-r.height/2)*r.pitchMm };
}
function pixelCoordinate(r: GeometricRaster, p: LensFieldPointMm): LensFieldPointMm {
  return { x: (p.x-r.centerMm.x)/r.pitchMm+r.width/2-.5, y: (r.centerMm.y-p.y)/r.pitchMm+r.height/2-.5 };
}
function supported(r: GeometricRaster, p: LensFieldPointMm, filter: GeometricResampler["filter"]): boolean {
  const q = pixelCoordinate(r, p);
  return filter === "nearest"
    ? Math.round(q.x) >= 0 && Math.round(q.x) < r.width && Math.round(q.y) >= 0 && Math.round(q.y) < r.height
    : q.x >= 0 && q.x <= r.width-1 && q.y >= 0 && q.y <= r.height-1;
}
/** @internal Shared deterministic crop for a validated pixel mask. */
export function calculateValidSourceCrop(mask: readonly boolean[], width: number, height: number): GeometricSamplingPlan["jointCrop"] {
  const heights = Array<number>(width).fill(0);
  let best: GeometricSamplingPlan["jointCrop"] = null, area = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) heights[x] = mask[y*width+x] ? heights[x]!+1 : 0;
    const stack: number[] = [];
    for (let x = 0; x <= width; x++) {
      const h = x === width ? 0 : heights[x]!;
      while (stack.length && heights[stack.at(-1)!]! > h) {
        const index = stack.pop()!, rectangleHeight = heights[index]!;
        const left = stack.length ? stack.at(-1)!+1 : 0, rectangleWidth = x-left;
        if (rectangleHeight*rectangleWidth > area) {
          area = rectangleHeight*rectangleWidth;
          best = { x: left, y: y-rectangleHeight+1, width: rectangleWidth, height: rectangleHeight };
        }
      }
      stack.push(x);
    }
  }
  return best;
}

/** Resolves one joint validity/crop/AA plan after composing compatible inverse maps. */
export function calculateGeometricSamplingPlan(input: {
  mapping: PreparedGeometricMapping; sourceRaster: GeometricRaster; destinationRaster: GeometricRaster;
  resampler: GeometricResampler; physicalProjectionDistanceMm: number;
}): CalculationResult<GeometricSamplingPlan> {
  const mapping = prepareGeometricMapping(input.mapping).value;
  if (mapping.groups.length > 1) throw new InvalidScientificInputError("Separate incompatible-domain groups before resampling.");
  const source = parseGeometricRaster(input.sourceRaster), destination = parseGeometricRaster(input.destinationRaster);
  const r = record(input.resampler, ["id", "version", "filter", "antialias"]);
  const resampler: GeometricResampler = { id: textValue(r.id), version: textValue(r.version),
    filter: choice(r.filter, ["nearest", "bilinear"]), antialias: choice(r.antialias, ["none", "source-prefiltered"]) };
  const projection = positive(input.physicalProjectionDistanceMm, "physicalProjectionDistanceMm");
  const points: GeometricMappingPoint[] = [], mask: boolean[] = [];
  for (let y = 0; y < destination.height; y++) for (let x = 0; x < destination.width; x++) {
    const mapped = calculatePreparedGeometricMappingPoint(mapping, pixelPoint(destination, x, y)).value;
    points.push(mapped); mask.push(supported(source, mapped.sourcePointMm, resampler.filter));
  }
  const requiresPrefilter = points.some((p) => p.principalStretches[0]*destination.pitchMm/source.pitchMm > 1+1e-12);
  const crop = calculateValidSourceCrop(mask, destination.width, destination.height);
  const angle = (mm: number): number => Math.atan(mm/projection)*180/Math.PI;
  const retained = points.filter((_, i) => crop !== null && i%destination.width >= crop.x &&
    i%destination.width < crop.x+crop.width && Math.floor(i/destination.width) >= crop.y &&
    Math.floor(i/destination.width) < crop.y+crop.height).map((p) => p.sourcePointMm);
  const envelope = retained.length ? { minX: Math.min(...retained.map((p) => angle(p.x))),
    maxX: Math.max(...retained.map((p) => angle(p.x))), minY: Math.min(...retained.map((p) => angle(p.y))),
    maxY: Math.max(...retained.map((p) => angle(p.y))) } : null;
  return approximationResult({ mapping, sourceRaster: source, destinationRaster: destination, resampler, points,
    validSourceMask: mask, jointCrop: crop, requiresPrefilter,
    canResample: !requiresPrefilter || resampler.antialias === "source-prefiltered",
    physicalCapturedFovDegrees: {
      horizontal: angle(source.centerMm.x+source.width*source.pitchMm/2)-angle(source.centerMm.x-source.width*source.pitchMm/2),
      vertical: angle(source.centerMm.y+source.height*source.pitchMm/2)-angle(source.centerMm.y-source.height*source.pitchMm/2)
    }, retainedSampleRayEnvelopeDegrees: envelope },
  "joint-geometric-sampling-plan", "0.1.0", ["Mask and crop are exact for this pixel-center lattice/filter, not continuous between-pixel support", "Compression requires explicitly source-prefiltered data; this API does not implement that prefilter", "No temporal trajectory crop guarantee"]);
}

/** Samples an already-formed scalar image once; null output marks missing source support. */
export function calculateGeometricResampling(input: {
  plan: GeometricSamplingPlan; sourceSamples: readonly number[];
}): CalculationResult<{ samples: readonly (number | null)[]; resamplePasses: 1; resampler: GeometricResampler }> {
  const plan = calculateGeometricSamplingPlan({ ...input.plan, physicalProjectionDistanceMm: 1 }).value;
  if (!plan.canResample) throw new InvalidScientificInputError("Compression requires source-prefiltered data.");
  const source = list(input.sourceSamples, 65536).map((v) => finite(v, "source sample"));
  if (source.length !== plan.sourceRaster.width*plan.sourceRaster.height) throw new InvalidScientificInputError("Source sample count mismatch.");
  const samples = plan.points.map((p, index): number | null => {
    if (!plan.validSourceMask[index]) return null;
    const q = pixelCoordinate(plan.sourceRaster, p.sourcePointMm), width = plan.sourceRaster.width;
    if (plan.resampler.filter === "nearest") return source[Math.round(q.y)*width+Math.round(q.x)]!;
    const x = Math.floor(q.x), y = Math.floor(q.y), dx = q.x-x, dy = q.y-y;
    // Exact boundary centers need no nonexistent neighbor; no border extension occurs.
    const x1 = dx === 0 ? x : x+1, y1 = dy === 0 ? y : y+1;
    return (1-dy)*((1-dx)*source[y*width+x]!+dx*source[y*width+x1]!) +
      dy*((1-dx)*source[y1*width+x]!+dx*source[y1*width+x1]!);
  });
  return approximationResult({ samples, resamplePasses: 1, resampler: plan.resampler },
    "single-pass-geometric-resampling", "0.1.0", ["Warps captured blur/noise; does not recalculate the optical PSF"]);
}
