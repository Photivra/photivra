// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { defocusDiscKernelRadius } from "../src/optics/defocus-disc-kernel.js";
import { InvalidConfigurationError, calculateDefocusCircle, simulateCapture, simulateDisplayView, simulateIdealReference,
  type SimulateCaptureOptions } from "../src/index.js";

const base: SimulateCaptureOptions = { scene: { preset: "slanted-edge" }, output: { width: 8, height: 8 }, subjectDistanceM: 2 };
const withDefocus = (lens: NonNullable<SimulateCaptureOptions["lens"]>): SimulateCaptureOptions => ({ ...base, lens: { ...lens, defocus: { model: "geometric-disc" } } });

describe("lens.defocus option (#492 step 1: parse and resolve, no rendering yet)", () => {
  it("in focus renders the same bytes as without the option and records a zero disc as an approximation", async () => {
    const plain = await simulateCapture({ ...base, lens: { fNumber: 4 } });
    const focused = await simulateCapture(withDefocus({ fNumber: 4 }));
    const explicit = await simulateCapture(withDefocus({ fNumber: 4, focusDistanceM: 2 }));
    for (const r of [focused, explicit]) {
      expect(Array.from(r.image.samples)).toEqual(Array.from(plain.image.samples));
      expect(Array.from(r.raw.codes)).toEqual(Array.from(plain.raw.codes));
      const defocus = r.assumptions.find((a) => a.id === "lens.defocus")!;
      expect(defocus.kind).toBe("model");
      expect(defocus.value).toMatchObject({ model: "geometric-disc", scientificStatus: "approximation", diameterMicrometers: 0, diameterSites: 0, kernelRadiusSites: null,
        fNumber: 4, samplePitchMicrometers: 6, defocusCircleModel: { id: "thin-lens-defocus-circle", version: "1.1.0" } });
      expect(defocus.explanation).toMatch(/approximation/u);
      expect(defocus.explanation).toMatch(/no defocus kernel is applied/u);
      // Every other assumption is the plain request's, except the pupil-sampling note, which now points to lens.defocus.
      const others = r.assumptions.filter((a) => a.id !== "lens.defocus" && a.id !== "lens.pupilSampling" && a.id !== "lens.focusDistanceM");
      expect(others).toEqual(plain.assumptions.filter((a) => a.id !== "lens.pupilSampling" && a.id !== "lens.focusDistanceM"));
      expect(r.assumptions.find((a) => a.id === "lens.pupilSampling")!.explanation).toMatch(/lens\.defocus/u);
    }
    expect(plain.assumptions.find((a) => a.id === "lens.defocus")).toBeUndefined();
    expect(focused.image.png).toEqual(plain.image.png);
    expect(focused.exposure).toEqual(plain.exposure);
  });

  it("refuses an out-of-focus request as not yet supported, naming the blur circle, instead of rendering it sharp", async () => {
    const c = calculateDefocusCircle({ focalLengthMm: 50, aperture: 4, focusDistanceM: 1.8, subjectDistanceM: 2 }).value.diameterMm * 1000;
    const request = withDefocus({ fNumber: 4, focusDistanceM: 1.8 });
    await expect(simulateCapture(request)).rejects.toThrow(InvalidConfigurationError);
    await expect(simulateCapture(request)).rejects.toThrow(new RegExp("simulateCapture does not yet support lens\\.defocus out of focus: the geometric blur circle here is " +
      String(c).replace(".", "\\.") + " µm \\(" + String(c / 6).replace(".", "\\.") + " sites of 6 µm\\) \\(kernel radius " + defocusDiscKernelRadius(c / 6) + " sites\\)", "u"));
    // The same resolution in the automatic modes (at the resolved f-number) and for a DNG.
    await expect(simulateCapture({ ...withDefocus({ focusDistanceM: 1.8 }), exposure: { mode: "program" } })).rejects.toThrow(/does not yet support lens\.defocus/u);
    await expect(simulateCapture({ ...request, output: { width: 8, height: 8, format: "dng" } })).rejects.toThrow(/does not yet support lens\.defocus/u);
    // Even a disc smaller than one site is a kernel, so it is refused too.
    await expect(simulateCapture(withDefocus({ fNumber: 16, focusDistanceM: 1.999 }))).rejects.toThrow(/kernel radius 0 sites/u);
    // Without the option the same focus distance renders as before (no blur, labelled).
    const sharp = await simulateCapture({ ...base, lens: { fNumber: 4, focusDistanceM: 1.8 } });
    expect(sharp.assumptions.find((a) => a.id === "lens.pupilSampling")!.explanation).toMatch(/defocus and depth of field are not rendered/u);
  });

  it("fails past the kernel radius cap with the cap and the radius asked for", async () => {
    // 50 mm f/4 focused at 0.5 m on a plane at 2 m: c = 2500·1.5/(4·2·0.45) mm = 1041.7 µm, 173.6 sites of 6 µm, radius 87 > 64.
    const c = calculateDefocusCircle({ focalLengthMm: 50, aperture: 4, focusDistanceM: 0.5, subjectDistanceM: 2 }).value.diameterMm * 1000;
    expect(defocusDiscKernelRadius(c / 6)).toBe(87);
    await expect(simulateCapture(withDefocus({ fNumber: 4, focusDistanceM: 0.5 }))).rejects.toThrow(
      /lens\.defocus: the blur circle is 1041\.6\d* µm \(173\.6\d* sites of 6 µm\)\. The defocus disc of 173\.6\d* sites needs a kernel radius of 87 sites; the limit is 64 sites \(provisional/u);
  });

  it("validates the record and refuses double counting with pupil sampling or a caller PSF", async () => {
    for (const defocus of [{}, { model: "wave" }, { model: "geometric-disc", radius: 3 }, "geometric-disc", null, 1]) {
      await expect(simulateCapture({ ...base, lens: { defocus: defocus as never } })).rejects.toThrow(InvalidConfigurationError);
    }
    await expect(simulateCapture({ ...base, lens: { defocus: { model: "wave" } as never } })).rejects.toThrow(/lens\.defocus\.model must be "geometric-disc"/u);
    await expect(simulateCapture({ ...base, lens: { defocus: { model: "geometric-disc", radius: 3 } as never } })).rejects.toThrow(/Unknown lens\.defocus field: radius/u);
    await expect(simulateCapture(withDefocus({ pupilSampling: { radialSamples: 1, angularSamples: 4 } }))).rejects.toThrow(/lens\.defocus cannot be combined with lens\.pupilSampling/u);
    const psf = { kind: "sampled-local", configuration: {} } as never;
    await expect(simulateCapture(withDefocus({ psf }))).rejects.toThrow(/lens\.defocus cannot be combined with lens\.psf/u);
    // Diffraction is allowed: in focus the result is that of diffraction alone.
    const diffracted = await simulateCapture({ ...base, lens: { fNumber: 8, diffraction: "circular-aperture" } });
    const both = await simulateCapture(withDefocus({ fNumber: 8, diffraction: "circular-aperture" }));
    expect(Array.from(both.image.samples)).toEqual(Array.from(diffracted.image.samples));
  });

  it("takes the same path in the display view and only records the disc in the ideal reference", async () => {
    const options: SimulateCaptureOptions = { ...base, output: { width: 40, height: 30 } };
    const view = { width: 20, height: 15 };
    const plain = await simulateDisplayView(options, view);
    const focused = await simulateDisplayView({ ...options, lens: { defocus: { model: "geometric-disc" } } }, view);
    expect(Array.from(focused.image.samples)).toEqual(Array.from(plain.image.samples));
    expect(focused.assumptions.find((a) => a.id === "lens.defocus")!.value).toMatchObject({ diameterMicrometers: 0, kernelRadiusSites: null });
    // Out of focus the display view renders the disc (#492 step 2b; test/display-view-defocus.test.ts).
    const blurred = await simulateDisplayView({ ...options, lens: { defocus: { model: "geometric-disc" }, focusDistanceM: 1.8 } }, view);
    expect(blurred.assumptions.find((a) => a.id === "view.defocus")!.value).toMatchObject({ kernel: "disc", scientificStatus: "approximation" });
    await expect(simulateDisplayView({ ...options, lens: { defocus: { model: "geometric-disc" }, pupilSampling: { radialSamples: 1, angularSamples: 4 } } }, view))
      .rejects.toThrow(/lens\.defocus cannot be combined with lens\.pupilSampling/u);
    const reference = await simulateIdealReference({ ...options, lens: { fNumber: 4, defocus: { model: "geometric-disc" }, focusDistanceM: 1.8 } });
    const sharpReference = await simulateIdealReference({ ...options, lens: { fNumber: 4, focusDistanceM: 1.8 } });
    expect(Array.from(reference.image.samples)).toEqual(Array.from(sharpReference.image.samples));
    const recorded = reference.assumptions.find((a) => a.id === "lens.defocus")!;
    expect((recorded.value as { diameterSites: number }).diameterSites).toBeGreaterThan(0);
    expect(recorded.explanation).toMatch(/not applied: the ideal reference has no camera effects/u);
  });
});
