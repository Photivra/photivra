// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  GENERIC_EQUIPMENT_TIERS, createGenericEquipmentTierSelection,
  resolveGenericEquipmentTierCatalog, resolveGenericEquipmentTierLensProfiles,
  resolveLensCorrectionPlan, calculateLensCorrectedCapture,
  type GenericEquipmentTier
} from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";

const base = loadBasicReferenceFixture();
const catalog = resolveGenericEquipmentTierCatalog({ presetVersion: "1.0.0" });
const channels = ["red", "green", "blue"] as const;
type Point = { x: number; y: number };
const radius = Math.hypot(18, 12);
const raster = { width: 9, height: 9, centerMm: { x: 0, y: 0 }, pitchMm: 3 };
type CorrectionResult = ReturnType<typeof calculateLensCorrectedCapture>["value"];
function setup(tier: GenericEquipmentTier): {
  asset: (typeof catalog)[number]["lens"]["matchedReference"];
  samples: number[]; render: (enabled: boolean, shift?: number) => CorrectionResult;
} {
  const asset = catalog.find((p) => p.tier === tier)!;
  const state = { bodyId: `photivra-${tier}-body`, bodyVersion: "1.0.0",
    lensId: `photivra-${tier}-prime`, lensVersion: "1.0.0",
    focalLengthMm: base.lens.focalLengthMm, aperture: base.lens.aperture,
    focusDistanceM: base.focus.distanceM, captureMode: "still" as const,
    outputWidth: 9, outputHeight: 9, frameRateHz: 0, stabilizationMode: "off" };
  const profiles = resolveGenericEquipmentTierLensProfiles({
    selection: createGenericEquipmentTierSelection({ presetVersion: "1.0.0", bodyTier: tier }), state
  });
  // Already sampled synthetic slanted step + fixed alternating noise.
  // This is an interpolation target, not a scene radiometry or MTF simulation.
  const samples = Array.from({ length: 81 }, (_, i) =>
    (i % 9 - Math.floor(i / 9) * .3 >= 4 ? .8 : .2) + (i % 2 ? .01 : -.01));
  const capture = { state, captureId: "tier-edge-reference",
    noiseRealizationId: "tier-fixed-noise", timeSeconds: base.exposure.shutterSeconds,
    raster, channels: { red: samples, green: samples, blue: samples } };
  const render = (enabled: boolean, shift = 0): CorrectionResult => calculateLensCorrectedCapture({
    plan: resolveLensCorrectionPlan({ profile: profiles.correction, state,
      selections: { geometry: enabled ? "on" : "off", "lateral-ca": enabled ? "on" : "off", gain: enabled ? "on" : "off" },
      outputKind: "processed", selectionKind: "camera-selectable" }).value,
    capture, destinationRaster: { ...raster, centerMm: { x: shift, y: 0 } },
    resampler: { id: "tier-edge-bilinear", version: "1", filter: "bilinear", antialias: "none" },
    physicalProjectionDistanceMm: base.expected.projection.imageDistanceMm, clippingLevel: 100
  }).value;
  return { asset: asset.lens.matchedReference, samples, render };
}
function radial(p: Point, k: number): Point {
  const scale = 1 + k * (p.x * p.x + p.y * p.y) / (radius * radius);
  return { x: p.x * scale, y: p.y * scale };
}
// Independent scalar bisection for the finite monotonic k1-only physical map.
function idealPoint(source: Point, k: number): Point {
  const length = Math.hypot(source.x, source.y);
  if (length === 0) return { x: 0, y: 0 };
  let lo = 0, hi = radius * 1.1;
  if (hi * (1 + k * (hi / radius) ** 2) < length) throw Error("Outside reference support");
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (mid * (1 + k * (mid / radius) ** 2) < length) lo = mid; else hi = mid;
  }
  const scale = (lo + hi) / 2 / length;
  return { x: source.x * scale, y: source.y * scale };
}
function distance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function pixel(i: number, shift = 0): Point {
  return { x: shift + (i % 9 - 4) * 3, y: (4 - Math.floor(i / 9)) * 3 };
}
function interpolate(samples: readonly number[], p: Point): number | null {
  const x = p.x / 3 + 4, y = 4 - p.y / 3;
  if (x < 0 || x > 8 || y < 0 || y > 8) return null;
  const left = Math.floor(x), top = Math.floor(y), dx = x - left, dy = y - top;
  const right = dx === 0 ? left : left + 1, bottom = dy === 0 ? top : top + 1;
  return (1 - dy) * ((1 - dx) * samples[top * 9 + left]! + dx * samples[top * 9 + right]!)
    + dy * ((1 - dx) * samples[bottom * 9 + left]! + dx * samples[bottom * 9 + right]!);
}
describe("tier correction residual and sampled-edge acceptance", () => {
  it.each(GENERIC_EQUIPMENT_TIERS)("%s exposes finite residual CA instead of claiming an exact physical inverse", (tier) => {
    const { asset: a, render } = setup(tier), on = render(true);
    const offsets = [a.lateralCaK1Offset, 0, -a.lateralCaK1Offset];
    for (const i of [0, 4, 8, 40, 72, 76, 80]) {
      const target = pixel(i);
      const corrected = channels.map((channel, c) => idealPoint(on.samplingPlans[channel]!.points[i]!.sourcePointMm,
        a.distortionK1 + offsets[c]!));
      const physical = offsets.map((offset) => idealPoint(target, a.distortionK1 + offset));
      expect(distance(corrected[1]!, target)).toBeLessThan(1e-10);
      for (const q of corrected) expect(distance(q, target)).toBeLessThan(.1);
      if (i !== 40) {
        const residual = distance(corrected[0]!, corrected[2]!);
        expect(residual).toBeGreaterThan(1e-5);
        expect(residual).toBeLessThan(distance(physical[0]!, physical[2]!));
      }
    }
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s independently predicts every map, Jacobian and gain/interpolated edge sample", (tier) => {
    const { asset: a, samples, render } = setup(tier), snapshot = [...samples];
    const off = render(false), on = render(true);
    expect(off.channels.red).toEqual(snapshot);
    expect(on.captureId).toBe(off.captureId);
    expect(on.noiseRealizationId).toBe(off.noiseRealizationId);
    const offsets = [a.lateralCaK1Offset, 0, -a.lateralCaK1Offset];
    let mixedStep = false;
    for (const [c, channel] of channels.entries()) {
      const map = (p: Point): Point => radial(radial(p, offsets[c]! * a.correctionCaFraction), a.distortionK1);
      const plan = on.samplingPlans[channel]!;
      expect(plan.requiresPrefilter).toBe(false);
      for (let i = 0; i < 81; i++) {
        const p = pixel(i), q = map(p), actual = plan.points[i]!;
        expect(actual.sourcePointMm.x).toBeCloseTo(q.x, 12);
        expect(actual.sourcePointMm.y).toBeCloseTo(q.y, 12);
        const h = 1e-4, xp = map({ x: p.x + h, y: p.y }), xm = map({ x: p.x - h, y: p.y }),
          yp = map({ x: p.x, y: p.y + h }), ym = map({ x: p.x, y: p.y - h });
        const j = [(xp.x - xm.x) / (2 * h), (yp.x - ym.x) / (2 * h),
          (xp.y - xm.y) / (2 * h), (yp.y - ym.y) / (2 * h)];
        j.forEach((value, k) => expect(actual.jacobian[k]).toBeCloseTo(value, 8));
        expect(actual.determinant).toBeCloseTo(j[0]! * j[3]! - j[1]! * j[2]!, 8);
        const trace = j.reduce((sum, value) => sum + value * value, 0);
        const det = j[0]! * j[3]! - j[1]! * j[2]!;
        const largest = Math.sqrt((trace + Math.sqrt(Math.max(0, trace * trace - 4 * det * det))) / 2);
        expect(actual.principalStretches[0]).toBeCloseTo(largest, 7);
        const signal = interpolate(samples, q)!;
        // Polynomial throughput is 1+r2*r^2; gain is its declared partial reciprocal.
        const gain = (1 + a.vignettingR2 * (p.x * p.x + p.y * p.y) / (radius * radius)) ** (-a.correctionGainStrength);
        expect(on.channels[channel][i]).toBeCloseTo(signal * gain, 12);
        if (signal > .22 && signal < .78) mixedStep = true;
      }
    }
    expect(mixedStep).toBe(true); // Interpolation changes an already sampled edge/noise target.
    expect(samples).toEqual(snapshot);
    expect(render(true)).toEqual(on);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s keeps missing support, crop and retained sample rays distinct from captured edge FOV", (tier) => {
    const { asset: a, samples, render } = setup(tier), result = render(true, 6);
    const offsets = [a.lateralCaK1Offset, 0, -a.lateralCaK1Offset];
    const mask = Array.from({ length: 81 }, (_, i) => offsets.every((offset) =>
      interpolate(samples, radial(radial(pixel(i, 6), offset * a.correctionCaFraction), a.distortionK1)) !== null));
    expect(result.validSourceMask).toEqual(mask);
    expect(mask.filter(Boolean).length).toBeLessThan(81);
    const crop = result.jointCrop!;
    expect(crop.width * crop.height).toBeLessThan(81);
    for (let y = crop.y; y < crop.y + crop.height; y++) for (let x = crop.x; x < crop.x + crop.width; x++)
      expect(mask[y * 9 + x]).toBe(true);
    for (const [c, channel] of channels.entries()) {
      const plan = result.samplingPlans[channel]!, rays: Point[] = [];
      for (let y = crop.y; y < crop.y + crop.height; y++) for (let x = crop.x; x < crop.x + crop.width; x++)
        rays.push(radial(radial(pixel(y * 9 + x, 6), offsets[c]! * a.correctionCaFraction), a.distortionK1));
      const angle = (mm: number): number => Math.atan(mm / base.expected.projection.imageDistanceMm) * 180 / Math.PI;
      // Each channel's reported envelope uses its own valid crop; the joint RGB crop is narrower or equal.
      const envelope = plan.retainedSampleRayEnvelopeDegrees!;
      expect(Math.min(...rays.map((p) => angle(p.x)))).toBeGreaterThanOrEqual(envelope.minX - 1e-10);
      expect(Math.max(...rays.map((p) => angle(p.x)))).toBeLessThanOrEqual(envelope.maxX + 1e-10);
      expect(plan.physicalCapturedFovDegrees.horizontal).toBeCloseTo(angle(13.5) - angle(-13.5), 12);
      result.channels[channel].forEach((value, i) => { if (!mask[i]) expect(value).toBeNull(); });
    }
  });
});
