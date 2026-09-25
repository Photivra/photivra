// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationProvenance,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite
} from "../core/validation.js";
import type { LensFieldPointMm } from "./radial-distortion.js";
import { calculateDefocusCircle } from "./depth-of-field.js";
import { calculateAiryDisk } from "./diffraction.js";

export const PSF_FOUNDATION_VERSION = "0.1.0" as const;

export type PsfContributionId =
  | "geometric-defocus-circle"
  | "circular-diffraction-first-zero"
  | "non-circular-diffraction"
  | "mechanical-pupil-clipping"
  | "field-curvature"
  | "field-dependent-aberration"
  | "field-dependent-bokeh";

export type PsfContributionStatus =
  | "implemented-diagnostic"
  | "reserved-contract";

export interface PsfContributionContract {
  id: PsfContributionId;
  status: PsfContributionStatus;
  dependsOn: readonly (
    | "field-position"
    | "focus-depth"
    | "pupil"
    | "wavelength"
  )[];
  note: string;
}

export interface PsfFoundationContract {
  version: typeof PSF_FOUNDATION_VERSION;
  coordinateSpace: "image-plane-metric";
  fieldAxes: "+X right, +Y up";
  compositionPolicy: "separate-contributions-no-combined-psf";
  contributions: readonly PsfContributionContract[];
  previewReferencePolicy: {
    previewMayApproximate: true;
    referenceMayUseHigherFidelity: true;
    mustPreserveContributionSemantics: true;
  };
  notes: readonly string[];
}

export interface CalculatePsfFoundationComponentsInput {
  focalLengthMm: number;
  aperture: number;
  focusDistanceM: number;
  subjectDistanceM: number;
  /**
   * Image-plane field position relative to the optical axis, in millimetres.
   * +X is right and +Y is up.
   */
  fieldPointMm: LensFieldPointMm;
  /**
   * Physical image-plane radius used only to normalize field position for
   * cross-case diagnostics. It is not a lens calibration or validity bound.
   */
  fieldNormalizationRadiusMm: number;
  spectralBasis: {
    kind: "monochromatic";
    wavelengthNm: number;
  };
}

export interface PsfFoundationComponents {
  context: {
    field: {
      imagePointMm: LensFieldPointMm;
      radiusMm: number;
      normalizationRadiusMm: number;
      normalizedRadius: number;
    };
    depth: {
      focusDistanceM: number;
      subjectDistanceM: number;
    };
    spectralBasis: {
      kind: "monochromatic";
      wavelengthNm: number;
    };
    pupil: {
      kind: "ideal-circular-f-number-derived";
      apertureFNumber: number;
      diameterMm: number;
    };
  };
  contributions: {
    geometricDefocus: {
      id: "geometric-defocus-circle";
      diameterMm: number;
      provenance: CalculationProvenance;
    };
    circularDiffraction: {
      id: "circular-diffraction-first-zero";
      firstZeroDiameterMicrometers: number;
      provenance: CalculationProvenance;
    };
  };
  composition: {
    status: "not-composed";
    note: string;
  };
}

const CONTRIBUTIONS = [
  {
    id: "geometric-defocus-circle",
    status: "implemented-diagnostic",
    dependsOn: ["focus-depth", "pupil"],
    note:
      "Existing thin-lens geometric defocus diameter. This is a blur-circle diagnostic, not a complete intensity PSF."
  },
  {
    id: "circular-diffraction-first-zero",
    status: "implemented-diagnostic",
    dependsOn: ["pupil", "wavelength"],
    note:
      "Existing ideal circular-pupil first-zero Airy diameter. This is a diffraction-size diagnostic, not a sampled intensity PSF."
  },
  {
    id: "non-circular-diffraction",
    status: "reserved-contract",
    dependsOn: ["pupil", "wavelength", "field-position"],
    note:
      "Reserved for a defensible pupil-dependent diffraction model. Polygon aperture geometry alone does not implement this contribution."
  },
  {
    id: "mechanical-pupil-clipping",
    status: "reserved-contract",
    dependsOn: ["pupil", "field-position"],
    note:
      "Reserved for field-dependent pupil clipping/mechanical vignetting that can affect both throughput and PSF/bokeh shape."
  },
  {
    id: "field-curvature",
    status: "reserved-contract",
    dependsOn: ["field-position", "focus-depth"],
    note:
      "Reserved for field-dependent focus displacement. It must not be represented as geometric distortion."
  },
  {
    id: "field-dependent-aberration",
    status: "reserved-contract",
    dependsOn: ["field-position", "focus-depth", "pupil", "wavelength"],
    note:
      "Reserved for defensible field-dependent aberration/PSF structure. Do not replace this with a generic lens-sharpness score."
  },
  {
    id: "field-dependent-bokeh",
    status: "reserved-contract",
    dependsOn: ["field-position", "focus-depth", "pupil"],
    note:
      "Reserved for field-dependent out-of-focus PSF/bokeh behavior, including future cat's-eye effects when pupil clipping is modeled."
  }
] as const satisfies readonly PsfContributionContract[];

const NOTES = [
  "This foundation preserves PSF-related contributions separately; it does not calculate a combined PSF, MTF, or one scalar lens-sharpness result.",
  "Existing geometric defocus and circular Airy outputs remain independently named scientific diagnostics with their own provenance.",
  "Reserved contributions describe ownership/dependencies only and do not claim implemented visual behavior.",
  "Illumination vignetting is a separate throughput-only model and is not a PSF contribution.",
  "Real-lens PSF calibration requires defensible provenance, compatible reuse rights, and explicit limitations/uncertainty."
] as const;

/**
 * Returns the public PSF/pupil foundation contract.
 *
 * The contract describes current diagnostics plus reserved future contribution
 * ownership. It does not imply that reserved contributions are implemented.
 */
export function getPsfFoundationContract(): PsfFoundationContract {
  return {
    version: PSF_FOUNDATION_VERSION,
    coordinateSpace: "image-plane-metric",
    fieldAxes: "+X right, +Y up",
    compositionPolicy: "separate-contributions-no-combined-psf",
    contributions: CONTRIBUTIONS.map((contribution) => ({
      ...contribution,
      dependsOn: [...contribution.dependsOn]
    })),
    previewReferencePolicy: {
      previewMayApproximate: true,
      referenceMayUseHigherFidelity: true,
      mustPreserveContributionSemantics: true
    },
    notes: [...NOTES]
  };
}

/**
 * Evaluates the currently implemented PSF-related diagnostics in one explicit
 * field/depth/spectral/pupil context without combining them into a synthetic
 * PSF or blur radius.
 *
 * Field position is recorded even though the current defocus-circle and
 * circular-Airy diagnostics are not field dependent. Future field-dependent
 * contributions can consume the same context without changing these existing
 * primitives.
 */
export function calculatePsfFoundationComponents(
  input: CalculatePsfFoundationComponentsInput
): CalculationResult<PsfFoundationComponents> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requirePositiveFinite("aperture", input.aperture);
  requirePositiveFinite("focusDistanceM", input.focusDistanceM);
  requirePositiveFinite("subjectDistanceM", input.subjectDistanceM);
  requirePositiveFinite(
    "fieldNormalizationRadiusMm",
    input.fieldNormalizationRadiusMm
  );
  if (input.spectralBasis?.kind !== "monochromatic") {
    throw new InvalidScientificInputError(
      'spectralBasis.kind must be "monochromatic".'
    );
  }
  requirePositiveFinite(
    "spectralBasis.wavelengthNm",
    input.spectralBasis.wavelengthNm
  );

  if (!Number.isFinite(input.fieldPointMm.x)) {
    throw new InvalidScientificInputError(
      "fieldPointMm.x must be finite."
    );
  }
  if (!Number.isFinite(input.fieldPointMm.y)) {
    throw new InvalidScientificInputError(
      "fieldPointMm.y must be finite."
    );
  }

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

  const radiusMm = Math.hypot(
    input.fieldPointMm.x,
    input.fieldPointMm.y
  );

  return calculatedResult(
    {
      context: {
        field: {
          imagePointMm: { ...input.fieldPointMm },
          radiusMm,
          normalizationRadiusMm: input.fieldNormalizationRadiusMm,
          normalizedRadius: radiusMm / input.fieldNormalizationRadiusMm
        },
        depth: {
          focusDistanceM: input.focusDistanceM,
          subjectDistanceM: input.subjectDistanceM
        },
        spectralBasis: {
          kind: "monochromatic",
          wavelengthNm: input.spectralBasis.wavelengthNm
        },
        pupil: {
          kind: "ideal-circular-f-number-derived",
          apertureFNumber: input.aperture,
          diameterMm: input.focalLengthMm / input.aperture
        }
      },
      contributions: {
        geometricDefocus: {
          id: "geometric-defocus-circle",
          diameterMm: defocus.value.diameterMm,
          provenance: { ...defocus.provenance }
        },
        circularDiffraction: {
          id: "circular-diffraction-first-zero",
          firstZeroDiameterMicrometers:
            diffraction.value.firstZeroDiameterMicrometers,
          provenance: { ...diffraction.provenance }
        }
      },
      composition: {
        status: "not-composed",
        note:
          "No combined PSF, MTF, convolution kernel, or scalar sharpness value has been calculated."
      }
    },
    "psf-foundation-separated-components",
    "1.0.0",
    [
      "Current geometric defocus and ideal circular-pupil diffraction diagnostics are evaluated independently",
      "Field position is explicit context but does not alter the current field-invariant diagnostic primitives",
      "The result intentionally does not combine defocus and diffraction into one blur radius or PSF",
      "Illumination vignetting is excluded because it is a separate throughput-only stage"
    ]
  );
}
