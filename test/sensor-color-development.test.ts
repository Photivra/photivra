// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { invertSensorColorMatrix, prepareSensorColorDevelopment, sensorColorReferenceWhite, SENSOR_COLOR_DEVELOPMENT_MODEL,
  RAW_HIGHLIGHT_RECONSTRUCTION_START } from "../src/color/sensor-color-development.js";
import { resolveCaptureColorModel } from "../src/color/capture-color.js";

const model = resolveCaptureColorModel(), srgb = model.cameraRgbToXyz;
/** Review r1 camera: camera-native response to D65 white is [0.45, 1, 0.65]; not white-normalized. */
const cameraWhite = [.45, 1, .65], r1 = srgb.map((row) => row.map((v, i) => v/cameraWhite[i]!));
const neutralGains = (raw: readonly number[]): number[] => raw.map((v) => raw[1]!/v);
function expectNeutral(rgb: readonly number[], level?: number): void {
  expect(Math.abs(rgb[0]!-rgb[1]!)).toBeLessThan(1e-14); expect(Math.abs(rgb[2]!-rgb[1]!)).toBeLessThan(1e-14);
  if (level !== undefined) expect(rgb[1]).toBeCloseTo(level, 13);
}

describe("sensor colour development 2.0.0", () => {
  it("develops a grey card neutral for a non-white-normalized camera matrix (review r1)", () => {
    expect(SENSOR_COLOR_DEVELOPMENT_MODEL).toEqual({ id: "sensor-color-development", version: "2.0.0" });
    const grey = cameraWhite.map((v) => v*.18);
    // WB not required: the scene white is D65, so camera-to-XYZ alone is already neutral.
    expectNeutral(prepareSensorColorDevelopment(r1, null).develop(grey), .18);
    // Custom WB measured on the same card: previously (0.40, 0.18, 0.277); now neutral at the same level.
    const wb = prepareSensorColorDevelopment(r1, neutralGains(grey));
    expectNeutral(wb.develop(grey), .18);
    for (const [i, v] of [.45, 1, .65].entries()) expect(wb.asShotNeutral[i]).toBeCloseTo(v, 14);
    for (const [i, v] of cameraWhite.entries()) expect(wb.cameraNeutralD65[i]).toBeCloseTo(v, 14);
  });
  it("neutralizes the scene white of any illuminant once, for any invertible matrix", () => {
    for (const matrix of [srgb, r1, [[.6, .3, .1], [.25, .7, .05], [.02, .1, .95]]]) {
      for (const illuminant of [[.3, .5, .2], [.9, .7, .35], [.2, .4, .6]]) {
        const raw = illuminant.map((v) => v*.4), development = prepareSensorColorDevelopment(matrix, neutralGains(raw));
        const rgb = development.develop(raw); expectNeutral(rgb);
        // DNG AsShotNeutral: camera neutral of the scene white, normalized to green.
        development.asShotNeutral.forEach((v, i) => expect(v).toBeCloseTo(raw[i]!/raw[1]!, 14));
      }
    }
  });
  it("keeps clipped highlights neutral by clipping WB-scaled channels at the smallest gain (review r2)", () => {
    for (const gains of [[2, 1, 1.5], [1.2, 1, 2.6], [.8, 1, .9]]) for (const matrix of [srgb, r1]) {
      const development = prepareSensorColorDevelopment(matrix, gains), counts = { whiteBalanceClippedSampleCount: 0, reconstructedPixelCount: 0 }, out = [0, 0, 0];
      development.developInto(1, 1, 1, out, 0, counts); expectNeutral(out);
      expect(counts.whiteBalanceClippedSampleCount).toBe(gains.filter((g) => g > Math.min(...gains)).length);
      // A pixel below every clip level is untouched by clipping.
      const low = [.1, .2, .1]; development.developInto(low[0]!, low[1]!, low[2]!, out, 0, counts);
      expect(out).toEqual(prepareSensorColorDevelopment(matrix, gains, "reconstruct").develop(low));
    }
  });
  it("reconstructs by blending toward neutral only above the documented start level", () => {
    const gains = [2, 1, 1.5], clip = prepareSensorColorDevelopment(r1, gains), rec = prepareSensorColorDevelopment(r1, gains, "reconstruct");
    expect(RAW_HIGHLIGHT_RECONSTRUCTION_START).toBe(.8);
    const counts = { whiteBalanceClippedSampleCount: 0, reconstructedPixelCount: 0 }, out = [0, 0, 0];
    // At white: neutral at the smallest-gain level, same as clip.
    rec.developInto(1, 1, 1, out, 0, counts); expectNeutral(out); expect(out).toEqual(clip.develop([1, 1, 1]));
    // Below the start: unclipped colour (no hue shift for bright saturated colours).
    const bright = [.7, .3, .75], unclipped = prepareSensorColorDevelopment(r1, gains, "reconstruct").develop(bright);
    expect(unclipped).not.toEqual(clip.develop(bright));
    rec.developInto(bright[0]!, bright[1]!, bright[2]!, out, 0, counts); expect(out).toEqual(unclipped);
    expect(counts.reconstructedPixelCount).toBe(1);
    // Continuous across the start level.
    const a = rec.develop([.8, .5, .2]), b = rec.develop([.8+1e-9, .5, .2]);
    a.forEach((v, i) => expect(Math.abs(v-b[i]!)).toBeLessThan(1e-7));
    // Halfway to white: half-way between unclipped and neutral.
    const half = [.9, .4, .2], h = rec.develop(half), u = half.map((v, i) => v*gains[i]!), n = Math.max(...u.map((v) => Math.min(v, 1)));
    const blend = u.map((v) => .5*v+.5*n), xyz = rec.cameraToXyz.map((r) => r.reduce((s, v, i) => s+v*blend[i]!, 0));
    const expected = model.xyzToCameraRgb.map((r) => r.reduce((s, v, i) => s+v*xyz[i]!, 0));
    h.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 13));
  });
  it("treats white-normalized profiles exactly and preserves signed values below clipping", () => {
    const d = prepareSensorColorDevelopment(srgb, null);
    expect(d.cameraNeutralD65).toEqual([1, 1, 1]); expect(d.appliedGains).toEqual([1, 1, 1]);
    const values = [-.25, .5, .125];
    const xyz = srgb.map((r) => r.reduce((s, v, i) => s+v*values[i]!, 0)), expected = model.xyzToCameraRgb.map((r) => r.reduce((s, v, i) => s+v*xyz[i]!, 0));
    expect(d.develop(values)).toEqual(expected); expect(expected[0]).toBeLessThan(0);
    expect(() => prepareSensorColorDevelopment(srgb, [1, 0, 1])).toThrow();
    expect(() => prepareSensorColorDevelopment(srgb, null, "unclip" as never)).toThrow();
    expect(() => prepareSensorColorDevelopment([[1, 0, 0], [0, 1, 0], [0, 0, -1]], null)).toThrow("positive camera coordinates");
  });
});

it("retains conditioned inversion and camera-coordinate D65 without WB application", () => {
  const inverse = invertSensorColorMatrix([[1,.5,0],[0,1,.25],[0,0,1]]);
  expect(inverse).toEqual([[1,-.5,.125],[0,1,-.25],[0,0,1]]);
  const white = resolveCaptureColorModel().referenceWhiteXyz;
  expect(sensorColorReferenceWhite(inverse)).toEqual([white.x-.5+.125*white.z,1-.25*white.z,white.z]);
  expect(() => invertSensorColorMatrix([[1,0,0],[0,1,0],[0,0,0]])).toThrow("Export color matrix is singular or outside supported conditioning.");
  expect(() => invertSensorColorMatrix([[1,0,0],[0,1,0],[0,0,.001]])).toThrow("Export inverse color matrix exceeds supported range.");
});
