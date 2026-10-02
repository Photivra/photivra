// SPDX-License-Identifier: Apache-2.0

/**
 * The legacy CameraConfiguration is a finite unit-bearing POC setting record, not a complete
 * equipment capability profile. Its parser lives in schema/validation; newer ISO/exposure
 * capabilities remain separate so adding a control policy does not reinterpret saved POC data.
 * @see docs/RELEASE_1_0.md and the corresponding domain guide.
 */

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
