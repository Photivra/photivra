// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { calculatePrintPlan, type PrintPlanInput } from "../src/index.js";

// Editable use cases, not visual-acuity or printer guarantees. All share one native
// source and one explicit angular convention rather than a chart per print size.
const cases = [
  { name: "stamp", width: 1, distance: 12 },
  { name: "book", width: 8, distance: 12 },
  { name: "home", width: 16, distance: 24 },
  { name: "gallery", width: 32, distance: 48 },
  { name: "billboard", width: 320, distance: 480 },
  { name: "half-mile-reference", width: 21120, distance: 31680 }
];
function plan(width: number, distance: number): PrintPlanInput {
  return { source: { kind: "native-retained", captureId: "owned-acceptance-capture", geometry: {
    imagingArea: { widthMm: 32, heightMm: 18 }, nativeRaster: { pixelWidth: 2560, pixelHeight: 1440 }, orientation: "landscape" } },
    printedImage: { width, height: width * 9 / 16, unit: "inches" }, viewingDistance: { value: distance, unit: "inches" },
    sampling: { kind: "angular-pixel-pitch", maximumArcminutesPerPixel: 1 },
    fit: { kind: "confirmed-native-aspect", maximumRelativeAspectError: 1e-12 } };
}
it.each(cases)("covers $name with explicit dimensions/distance and no quality promotion", c => {
  const p = calculatePrintPlan(plan(c.width, c.distance)).value;
  // Independent count search from inch-native trig geometry; not the planner's GCD helper.
  const pitchInches = 2 * c.distance * Math.tan(Math.PI / 21600);
  let count = 1; while (16 * count * pitchInches < c.width || 9 * count * pitchInches < c.width * 9 / 16) count++;
  expect(p.minimumSamplingRaster).toEqual({ pixelWidth: 16 * count, pixelHeight: 9 * count });
  expect(p.status).toBe("ready"); expect(p.recommended!.raster.pixelWidth).toBeLessThanOrEqual(2560);
  expect(p.capturedDetailAssessment).toBe("unassessed"); expect(p.deliveryAssessment).toBe("unassessed");
});
it("replans the heavy retained crop and recovers after invalid size/criterion changes", () => {
  const r = plan(16, 24); if (r.source.kind !== "native-retained") throw Error("fixture");
  r.source.geometry.outputCropRect = { x: 1000, y: 600, width: 640, height: 360 };
  const cropped = calculatePrintPlan(r).value;
  expect(cropped.status).toBe("insufficient-native-pixels"); expect(cropped.recommended).toBeNull();
  const available = cropped.alternatives!.maximumImageMmAtCurrentDistance;
  const recovered = calculatePrintPlan({ ...r, printedImage: { ...available, unit: "mm" } }).value;
  expect(recovered.status).toBe("ready"); expect(recovered.recommended!.raster.pixelWidth).toBeLessThanOrEqual(640);
  r.printedImage.width = 0; expect(() => calculatePrintPlan(r)).toThrow(); r.printedImage.width = 16;
  r.viewingDistance.value = 100; expect(calculatePrintPlan(r).value.status).toBe("ready");
  expect(cropped.status).toBe("insufficient-native-pixels"); // Previous result remains an immutable calculation snapshot.
});
