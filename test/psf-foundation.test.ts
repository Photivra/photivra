import { describe, expect, it } from "vitest";

import {
  calculateAiryDisk,
  calculateDefocusCircle,
  calculatePsfFoundationComponents,
  getPsfFoundationContract
} from "../src/index.js";

describe("PSF/pupil foundation", () => {
  it("publishes current diagnostics separately from reserved contributions", () => {
    const contract = getPsfFoundationContract();
    const byId = new Map(
      contract.contributions.map((contribution) => [
        contribution.id,
        contribution
      ])
    );

    expect(contract.version).toBe("0.1.0");
    expect(contract.coordinateSpace).toBe("image-plane-metric");
    expect(contract.fieldAxes).toBe("+X right, +Y up");
    expect(contract.compositionPolicy).toBe(
      "separate-contributions-no-combined-psf"
    );

    expect(byId.get("geometric-defocus-circle")?.status).toBe(
      "implemented-diagnostic"
    );
    expect(byId.get("circular-diffraction-first-zero")?.status).toBe(
      "implemented-diagnostic"
    );
    expect(byId.get("non-circular-diffraction")?.status).toBe(
      "reserved-contract"
    );
    expect(byId.get("mechanical-pupil-clipping")?.status).toBe(
      "reserved-contract"
    );
    expect(byId.get("field-curvature")?.status).toBe(
      "reserved-contract"
    );
    expect(byId.get("field-dependent-aberration")?.status).toBe(
      "reserved-contract"
    );
    expect(byId.get("field-dependent-bokeh")?.status).toBe(
      "reserved-contract"
    );
  });

  it("matches the existing defocus and Airy diagnostics exactly", () => {
    const input = {
      focalLengthMm: 85,
      aperture: 2.8,
      focusDistanceM: 10,
      subjectDistanceM: 20,
      fieldPointMm: { x: 12, y: 8 },
      fieldNormalizationRadiusMm: 21.6,
      spectralBasis: {
        kind: "monochromatic" as const,
        wavelengthNm: 550
      }
    };

    const foundation = calculatePsfFoundationComponents(input);
    const defocus = calculateDefocusCircle({
      focalLengthMm: input.focalLengthMm,
      aperture: input.aperture,
      focusDistanceM: input.focusDistanceM,
      subjectDistanceM: input.subjectDistanceM
    });
    const diffraction = calculateAiryDisk({
      aperture: input.aperture,
      wavelengthNm: input.spectralBasis.wavelengthNm
    });

    expect(
      foundation.value.contributions.geometricDefocus.diameterMm
    ).toBe(defocus.value.diameterMm);
    expect(
      foundation.value.contributions.circularDiffraction
        .firstZeroDiameterMicrometers
    ).toBe(diffraction.value.firstZeroDiameterMicrometers);

    expect(
      foundation.value.contributions.geometricDefocus.provenance
    ).toEqual(defocus.provenance);
    expect(
      foundation.value.contributions.circularDiffraction.provenance
    ).toEqual(diffraction.provenance);
  });

  it("records explicit field, depth, spectral, and pupil context", () => {
    const result = calculatePsfFoundationComponents({
      focalLengthMm: 50,
      aperture: 4,
      focusDistanceM: 5,
      subjectDistanceM: 8,
      fieldPointMm: { x: 12, y: -5 },
      fieldNormalizationRadiusMm: 20,
      spectralBasis: {
        kind: "monochromatic",
        wavelengthNm: 530
      }
    });

    expect(result.value.context.field).toEqual({
      imagePointMm: { x: 12, y: -5 },
      radiusMm: 13,
      normalizationRadiusMm: 20,
      normalizedRadius: 0.65
    });
    expect(result.value.context.depth).toEqual({
      focusDistanceM: 5,
      subjectDistanceM: 8
    });
    expect(result.value.context.spectralBasis).toEqual({
      kind: "monochromatic",
      wavelengthNm: 530
    });
    expect(result.value.context.pupil).toEqual({
      kind: "ideal-circular-f-number-derived",
      apertureFNumber: 4,
      diameterMm: 12.5
    });
  });

  it("keeps current diagnostics field invariant while preserving field context", () => {
    const base = {
      focalLengthMm: 50,
      aperture: 2,
      focusDistanceM: 4,
      subjectDistanceM: 7,
      fieldNormalizationRadiusMm: 20,
      spectralBasis: {
        kind: "monochromatic" as const,
        wavelengthNm: 550
      }
    };

    const center = calculatePsfFoundationComponents({
      ...base,
      fieldPointMm: { x: 0, y: 0 }
    });
    const corner = calculatePsfFoundationComponents({
      ...base,
      fieldPointMm: { x: 16, y: 12 }
    });

    expect(center.value.context.field.normalizedRadius).toBe(0);
    expect(corner.value.context.field.normalizedRadius).toBe(1);
    expect(center.value.contributions).toEqual(corner.value.contributions);
  });

  it("changes geometric defocus with subject depth without changing diffraction", () => {
    const base = {
      focalLengthMm: 85,
      aperture: 2.8,
      focusDistanceM: 10,
      fieldPointMm: { x: 0, y: 0 },
      fieldNormalizationRadiusMm: 20,
      spectralBasis: {
        kind: "monochromatic" as const,
        wavelengthNm: 550
      }
    };

    const focused = calculatePsfFoundationComponents({
      ...base,
      subjectDistanceM: 10
    });
    const defocused = calculatePsfFoundationComponents({
      ...base,
      subjectDistanceM: 20
    });

    expect(
      focused.value.contributions.geometricDefocus.diameterMm
    ).toBeCloseTo(0, 12);
    expect(
      defocused.value.contributions.geometricDefocus.diameterMm
    ).toBeGreaterThan(0);
    expect(
      focused.value.contributions.circularDiffraction
    ).toEqual(defocused.value.contributions.circularDiffraction);
  });

  it("changes circular diffraction with wavelength without changing defocus", () => {
    const base = {
      focalLengthMm: 50,
      aperture: 8,
      focusDistanceM: 5,
      subjectDistanceM: 8,
      fieldPointMm: { x: 10, y: 0 },
      fieldNormalizationRadiusMm: 20
    };

    const blue = calculatePsfFoundationComponents({
      ...base,
      spectralBasis: {
        kind: "monochromatic",
        wavelengthNm: 450
      }
    });
    const red = calculatePsfFoundationComponents({
      ...base,
      spectralBasis: {
        kind: "monochromatic",
        wavelengthNm: 650
      }
    });

    expect(
      blue.value.contributions.geometricDefocus
    ).toEqual(red.value.contributions.geometricDefocus);
    expect(
      red.value.contributions.circularDiffraction
        .firstZeroDiameterMicrometers
    ).toBeGreaterThan(
      blue.value.contributions.circularDiffraction
        .firstZeroDiameterMicrometers
    );
  });

  it("never emits a combined PSF or synthetic sharpness scalar", () => {
    const result = calculatePsfFoundationComponents({
      focalLengthMm: 50,
      aperture: 4,
      focusDistanceM: 5,
      subjectDistanceM: 7,
      fieldPointMm: { x: 10, y: 5 },
      fieldNormalizationRadiusMm: 20,
      spectralBasis: {
        kind: "monochromatic",
        wavelengthNm: 550
      }
    });

    expect(result.value.composition).toEqual({
      status: "not-composed",
      note:
        "No combined PSF, MTF, convolution kernel, or scalar sharpness value has been calculated."
    });
    expect(JSON.stringify(result.value)).not.toContain("lensSharpness");
    expect(JSON.stringify(result.value)).not.toContain("combinedBlur");
  });

  it("keeps illumination vignetting outside the PSF contribution list", () => {
    const contract = getPsfFoundationContract();
    expect(
      contract.contributions.some(
        (contribution) =>
          (contribution.id as string) === "illumination-vignetting"
      )
    ).toBe(false);
    expect(contract.notes.join(" ")).toContain(
      "Illumination vignetting is a separate throughput-only model"
    );
  });

  it("returns independent contract copies", () => {
    const first = getPsfFoundationContract();
    const second = getPsfFoundationContract();

    expect(first).not.toBe(second);
    expect(first.contributions).not.toBe(second.contributions);

    const mutable = first.contributions as unknown as Array<{
      note: string;
    }>;
    mutable[0]!.note = "mutated";

    expect(getPsfFoundationContract().contributions[0]?.note).not.toBe(
      "mutated"
    );
  });

  it("rejects invalid field/spectral normalization inputs", () => {
    expect(() =>
      calculatePsfFoundationComponents({
        focalLengthMm: 50,
        aperture: 4,
        focusDistanceM: 5,
        subjectDistanceM: 7,
        fieldPointMm: { x: Number.NaN, y: 0 },
        fieldNormalizationRadiusMm: 20,
        spectralBasis: {
          kind: "monochromatic",
          wavelengthNm: 550
        }
      })
    ).toThrow("fieldPointMm.x");

    expect(() =>
      calculatePsfFoundationComponents({
        focalLengthMm: 50,
        aperture: 4,
        focusDistanceM: 5,
        subjectDistanceM: 7,
        fieldPointMm: { x: 0, y: 0 },
        fieldNormalizationRadiusMm: 0,
        spectralBasis: {
          kind: "monochromatic",
          wavelengthNm: 550
        }
      })
    ).toThrow("fieldNormalizationRadiusMm");

    expect(() =>
      calculatePsfFoundationComponents({
        focalLengthMm: 50,
        aperture: 4,
        focusDistanceM: 5,
        subjectDistanceM: 7,
        fieldPointMm: { x: 0, y: 0 },
        fieldNormalizationRadiusMm: 20,
        spectralBasis: {
          kind: "monochromatic",
          wavelengthNm: 0
        }
      })
    ).toThrow("spectralBasis.wavelengthNm");

    expect(() =>
      calculatePsfFoundationComponents({
        focalLengthMm: 50,
        aperture: 4,
        focusDistanceM: 5,
        subjectDistanceM: 7,
        fieldPointMm: { x: 0, y: 0 },
        fieldNormalizationRadiusMm: 20,
        spectralBasis: {
          kind: "broadband",
          wavelengthNm: 550
        } as unknown as {
          kind: "monochromatic";
          wavelengthNm: number;
        }
      })
    ).toThrow("spectralBasis.kind");
  });
});
