// SPDX-License-Identifier: Apache-2.0

/**
 * The legacy CameraConfiguration: one set of camera settings, with units, for the
 * proof-of-concept (POC) simulation. It is not a full description of what a camera can do.
 *
 * Its parser is in schema/validation. Newer ISO and exposure capabilities are separate types,
 * so adding a control policy never changes the meaning of saved POC data.
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
