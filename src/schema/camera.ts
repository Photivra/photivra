// SPDX-License-Identifier: Apache-2.0

export interface SensorConfiguration {
  widthMm: number;
  heightMm: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface LensConfiguration {
  focalLengthMm: number;
  aperture: number;
}

export interface ExposureConfiguration {
  shutterSeconds: number;
  iso: number;
}

export interface FocusConfiguration {
  focusDistanceM: number;
}

export type CameraSupport = "handheld" | "braced" | "monopod" | "tripod";

export interface StabilizationConfiguration {
  bodyEnabled: boolean;
  lensEnabled: boolean;
  support: CameraSupport;
}

/**
 * Renderer-independent camera configuration consumed by simulation modules.
 */
export interface CameraConfiguration {
  sensor: SensorConfiguration;
  lens: LensConfiguration;
  exposure: ExposureConfiguration;
  focus: FocusConfiguration;
  stabilization?: StabilizationConfiguration;
}
