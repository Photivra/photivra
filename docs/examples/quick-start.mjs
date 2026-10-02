// SPDX-License-Identifier: Apache-2.0

import console from "node:console";

// Node 22/24/26 executable example; the scientific imports are also browser-safe.
import { calculateFieldOfView, calculateExposureValue100, ENGINE_API_VERSION } from "@photivra/engine";
const fov = calculateFieldOfView({ focalLengthMm: 50, sensorDimensionMm: 36 });
const expectedDegrees = 2 * Math.atan(36 / (2 * 50)) * 180 / Math.PI;
if (Math.abs(fov.value.degrees - expectedDegrees) > 1e-12) throw new Error("FOV invariant changed");
const exposure = calculateExposureValue100({ aperture: 4, shutterSeconds: 1 / 125 });
if (Math.abs(exposure.value - Math.log2(4 ** 2 * 125)) > 1e-12) throw new Error("EV invariant changed");
console.log({ engineApiVersion: ENGINE_API_VERSION, horizontalFovDegrees: fov.value.degrees, ev100: exposure.value });
