// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { resolveCaptureColorModel } from "./capture-color.js";

type Matrix = readonly (readonly number[])[];
function multiply(m: Matrix, values: readonly number[]): number[] {
  return m.map((row) => row.reduce((sum, v, i) => sum+v*values[i]!, 0));
}
/** Validated 3×3 matrices only; retains the declared determinant/inverse bounds. */
export function invertSensorColorMatrix(m: Matrix): number[][] {
  const [a,b,c,d,e,f,g,h,i]=m.flat() as number[], det=a!*(e!*i!-f!*h!)-b!*(d!*i!-f!*g!)+c!*(d!*h!-e!*g!);
  if (!Number.isFinite(det) || Math.abs(det)<1e-9) throw new InvalidConfigurationError("Export color matrix is singular or outside supported conditioning.");
  const result=[[e!*i!-f!*h!,c!*h!-b!*i!,b!*f!-c!*e!],[f!*g!-d!*i!,a!*i!-c!*g!,c!*d!-a!*f!],[d!*h!-e!*g!,b!*g!-a!*h!,a!*e!-b!*d!]].map((r) => r.map((v) => v/det));
  if (result.flat().some((v) => !Number.isFinite(v) || Math.abs(v)>100)) throw new InvalidConfigurationError("Export inverse color matrix exceeds supported range.");
  return result;
}

interface SensorColorDevelopment {
  referenceWhiteXyz: { x: number; y: 1; z: number };
  develop(values: readonly number[]): number[];
}

/**
 * Internal adapter for validated normalized sensor RGB and declared D65 profile.
 * The caller owns profile evidence, CFA/basis binding and one-time WB authorization.
 * This is distinct from the ideal virtual-camera transform: gains act in sensor
 * channels before camera-to-XYZ, followed by XYZ-to-linear-sRGB. No clipping,
 * adaptation, calibration inference, geometry or container metadata is performed.
 */
export function prepareSensorColorDevelopment(cameraChannelsToXyz: Matrix, gains: readonly number[]): SensorColorDevelopment {
  const model = resolveCaptureColorModel();
  return {
    referenceWhiteXyz: model.referenceWhiteXyz,
    develop(values: readonly number[]): number[] {
      const balanced = values.map((n, i) => n*gains[i]!);
      return multiply(model.xyzToCameraRgb, multiply(cameraChannelsToXyz, balanced));
    }
  };
}

/** Camera coordinates of the declared D65 white; container policy remains caller-owned. */
export function sensorColorReferenceWhite(xyzToCamera: Matrix): number[] {
  const white = resolveCaptureColorModel().referenceWhiteXyz;
  return multiply(xyzToCamera, [white.x, 1, white.z]);
}
