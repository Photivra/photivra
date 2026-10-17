# Virtual-camera linear color

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

This page describes Photivra's ideal "virtual camera" colour space, and how to convert a simulated capture's colour planes into linear RGB with an explicit white-balance choice. (This was issue #15B.)

## The ideal colorimetric camera

`resolveCaptureColorModel()` defines an ideal colorimetric camera based on the CIE 1931 2-degree observer.

- Its red, green and blue channels are co-sited, and are an invertible encoding of XYZ in the linear-sRGB primaries, with a D65 reference white.
- They are relative linear values. They are not electrons, spectral response measurements or a commercial camera's RGB.
- Choosing this profile is a claim by the upstream producer about what the samples mean. Labelling arbitrary sensor data with its ID does not make that data valid.

**Primaries and white.** Red (0.64,0.33), green (0.30,0.60), blue (0.15,0.06), and D65 (0.3127,0.3290).

**How the matrices are derived** (independently):

1. Form each primary's column `(x/y,1,(1-x-y)/y)`.
2. Solve each column's scale against normalised D65 XYZ.
3. Scale the columns.
4. Invert the resulting 3x3 matrix.

Model `0.1.0` exposes both row-major matrices, the observer, the reference illuminant and white, the evidence identity and the valid conditions. No transfer curve, gamut mapping or clamp to [0,1] is applied. The maths is `calculated`, not `calibrated`.

## Converting a capture plane

`calculateCaptureColorTransform()` takes a validated `SimulatedCapture` and one untreated plane: either inline XYZ, or exactly the `photivra-colorimetric-rgb-d65` virtual-camera plane.

- It returns a new immutable transformed RGB plane, the model data, the source plane and state IDs, and the selected white-balance (WB) policy.
- It does not change the capture's exposure, focus, noise or source manifest.
- Preview and export use the same API. No renderer or file-format dependency is added.

| Explicit policy | Meaning |
| --- | --- |
| preserve-intent | Convert the color basis only; retain resolved WB as intent without applying it. XYZ reference white must match the documented D65 convention exactly. |
| apply-resolved-rgb-gains | Convert XYZ to the camera RGB basis, then multiply the resolved #108 red/green/blue gains. Caller must bind gains to the exact camera profile/version. No AWB estimator or implicit adopted-white adaptation runs. |
| adopted-white-xyz-scaling | In XYZ, multiply X and Z by target-D65/adopted-white ratios, leave Y unchanged, then convert to linear RGB. Requires explicit adopted white; consumes no RGB gains. Reports approximation provenance. |
| adopted-white-xyz-scaling + `transform` | Optional `transform: "bradford" \| "cat16" \| "von-kries-hpe"` replaces the diagonal XYZ scaling with complete (D = 1) cone-space adaptation from the adopted white to D65 ([Colorimetry](COLORIMETRY.md#chromatic-adaptation)). Model `capture-color-<transform>-adaptation`, applied-transform profile `photivra-<transform>-adaptation`, still approximation provenance. Omitting `transform` keeps the original diagonal model and its IDs unchanged. |

("#108" in the table is the resolved white-balance state.)

## Limits of XYZ diagonal scaling

XYZ diagonal scaling is the default when `transform` is omitted. It is deliberately a limited approximation of chromatic adaptation. It is not Bradford, a physiological cone model or a full colour-appearance model.

- It maps the chosen normalised adopted white to D65, keeping its Y. That this one colour maps correctly does not prove perceptual accuracy for other colours.
- Ratios must lie in [1e-6,1e6], the supported numerical range. No validated physical accuracy range is claimed.
- Under mixed lighting, the adopted white is still a choice made by the camera or photographer. The result always states `claimsUniqueSceneWhite:false`.
- Encoding white and adopted white are separate records. RGB gains do not derive or update the adopted white.

## Values, saturation and history

- Signed samples, headroom above white and the source's reference-value normalisation are all kept. Non-finite arithmetic fails with the scientific-result error.
- Source saturation is kept as **upstream capture history, in the original source-channel domain**. It is not an output clipping threshold or a white level for the transformed RGB.
- The result does no clipping, and creates no new saturation count.
- Existing digital lens-correction history is kept. Colour, adaptation or gain history rejects a second colour conversion.
- These fail closed (are rejected): missing or wrong profile versions, unsupported spectral channel identities, already-transformed input, external storage, reused output IDs and malformed policies.
- External data must be loaded and verified independently before any future streaming colour executor. This API does no IO.

## Committing the result

To put the returned plane into a new container:

1. carry over the original source manifest and capture settings;
2. add the returned model and evidence to `models`, as appropriate;
3. include the derived plane.

`createSimulatedCapture()` rechecks the total inline size budget. Callers decide whether to keep both the master and the derived planes. A transform result does not claim an external artifact checksum for newly generated bytes. Schema `0.2.0` explicitly records the applied chromatic adaptation; `0.1.0` archives migrate without inventing an adaptation.

## Scope

The fixed ideal basis has no sensor calibration that depends on the lighting. Future measured or spectral sensor models need their own versioned channel→XYZ profiles, with explicit reference illumination, validity range and approximation or calibration evidence. This implementation rejects them, rather than inventing a universal matrix or interpolating between undocumented illuminants.

Other stages are owned elsewhere: quantisation ([linear capture encoding](LINEAR_CAPTURE_ENCODING.md)), tone, look, gamut, transfer and display ([processed output](PROCESSED_OUTPUT.md)), file mapping ([photographic export](PHOTOGRAPHIC_EXPORT.md)) and production ordering ([production composition](PRODUCTION_COMPOSITION.md)). No stage is turned on here.

## Sources and tests

Factual research: the [W3C CSS Color 4 linear sRGB definition](https://www.w3.org/TR/css-color-4/#predefined-sRGB) documents the primary and white chromaticities, and distinguishes linear-light values from the transfer-encoded space. Only these public numerical facts and colour-space distinctions are used. No source code, published conversion matrices, protected prose, or calibration or colour tables were included.

Reference coefficient tests check independently stated numerical values to an absolute tolerance of about 5e-14. Invariant tests check the primary chromaticities, black and the D65 white.

AI-assisted draft material is still subject to substantive human review of science and provenance, and DCO certification.
