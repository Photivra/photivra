// SPDX-License-Identifier: Apache-2.0

import console from "node:console";

// Node 22/24/26 executable example; simulateCapture itself is browser-safe.
import { simulateCapture } from "@photivra/engine";
const capture = await simulateCapture({
  camera: "professional",
  scene: { preset: "slanted-edge" },
  output: { width: 32, height: 32, format: "jpeg" }
});
if (capture.image.jpeg[0] !== 0xff || capture.image.jpeg[1] !== 0xd8) throw new Error("JPEG output changed");
console.log({ settings: capture.exposure.settings, jpegBytes: capture.image.jpeg.length,
  assumptions: capture.assumptions.map((a) => a.id) });
