// SPDX-License-Identifier: Apache-2.0

import { resolveCaptureColorModel, VIRTUAL_COLOR_CAMERA_PROFILE, type SimulatedCaptureInput } from "../../src/index.js";
import { loadBasicReferenceFixture } from "./basic-reference-fixture.js";
/** Tiny XYZ master tied to #130's canonical camera/seed; independently owned samples. */
export function loadLinearCaptureInput(): SimulatedCaptureInput {
  const fixture = loadBasicReferenceFixture(), model = resolveCaptureColorModel();
  return { captureId: "color-capture", sceneStateId: "fixture-scene", sceneTimeSeconds: 0,
    geometry: { imagingArea: fixture.sensor.imagingArea, nativeRaster: fixture.sensor.nativeRaster,
      orientation: "landscape", outputRaster: { pixelWidth: 2, pixelHeight: 1 } },
    exposure: { focalLengthMm: fixture.lens.focalLengthMm, aperture: fixture.lens.aperture,
      shutterSeconds: fixture.exposure.shutterSeconds, iso: fixture.exposure.iso },
    focus: { kind: "finite", distanceM: fixture.focus.distanceM },
    noise: { seedUint32: fixture.stochasticSeedUint32, realizationId: "noise", model: { id: "fixture-noise", version: "1" } },
    source: { kind: "scene-linear-master", artifactId: "fixture-master", sha256: "a".repeat(64), dynamicRangeHistory: "unknown" },
    whiteBalanceIntent: null, adoptedWhiteXyz: null,
    models: [{ profile: VIRTUAL_COLOR_CAMERA_PROFILE, scientificStatus: "calculated", publicEvidenceIds: model.publicEvidenceIds }],
    planes: [{ id: "source", imageStateId: "source-state", imageState: "scene-referred-xyz", rasterBinding: "output",
      pixelWidth: 2, pixelHeight: 1, channelIds: ["X", "Y", "Z"], colorProfile: { id: "cie-1931-2-degree-xyz", version: "1.0.0" },
      encodingReferenceWhiteXyz: model.referenceWhiteXyz, referenceWhiteValue: 1, whiteBalanceApplication: "not-applicable",
      captureSaturation: { kind: "not-modeled" }, appliedTransforms: [],
      storage: { kind: "inline-float64", samples: [model.referenceWhiteXyz.x, 1, model.referenceWhiteXyz.z, 0, 0, 0] } }] };
}
