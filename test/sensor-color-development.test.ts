import { expect, it } from "vitest";
import { invertSensorColorMatrix, prepareSensorColorDevelopment, sensorColorReferenceWhite } from "../src/color/sensor-color-development.js";
import { resolveCaptureColorModel } from "../src/color/capture-color.js";

it("applies sensor gains before a mixing matrix while preserving signed unclipped values", () => {
  const matrix = [[1, .5, 0], [0, 1, .25], [0, 0, 1]], gains = [2, 3, 4], values = [-1, 2, .5];
  const saved = JSON.stringify({matrix, gains, values});
  const development = prepareSensorColorDevelopment(matrix, gains);
  // Balanced sensor channels [-2,6,2] produce XYZ [1,6.5,2]. Applying
  // these gains after the mixing matrix would instead give [0,6.375,2].
  const expected = resolveCaptureColorModel().xyzToCameraRgb.map((r) => r[0]+r[1]*6.5+r[2]*2);
  expect(development.develop(values)).toEqual(expected);
  expect(expected.some((v) => v < 0)).toBe(true);
  expect(expected.some((v) => v > 1)).toBe(true);
  expect(JSON.stringify({matrix, gains, values})).toBe(saved);
  expect(development.develop(values)).toEqual(expected);
});

it("retains conditioned inversion and camera-coordinate D65 without WB application", () => {
  const inverse = invertSensorColorMatrix([[1,.5,0],[0,1,.25],[0,0,1]]);
  expect(inverse).toEqual([[1,-.5,.125],[0,1,-.25],[0,0,1]]);
  const white = resolveCaptureColorModel().referenceWhiteXyz;
  expect(sensorColorReferenceWhite(inverse)).toEqual([white.x-.5+.125*white.z,1-.25*white.z,white.z]);
  expect(() => invertSensorColorMatrix([[1,0,0],[0,1,0],[0,0,0]])).toThrow("Export color matrix is singular or outside supported conditioning.");
  expect(() => invertSensorColorMatrix([[1,0,0],[0,1,0],[0,0,.001]])).toThrow("Export inverse color matrix exceeds supported range.");
});
