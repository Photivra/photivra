# Regional Print detail diagnostic — model specification 0.1.0

This diagnostic measures how much contrast of a known test pattern survives in one region of an image. It is the first, strictly mathematical part of the Print detail work (issue #196). It uses the [Print geometry contract published in 1.1.0](PRINT_PLANNING.md).

It is **not**:

- full acceptance of issue #196;
- a sharpness evaluator for natural images;
- a visibility threshold;
- an overall print pass.

Related documents:

- The [validation protocol](PRINT_DETAIL_VALIDATION.md) and [capability ledger](validation/print-196-candidate-capabilities.json) say what is tested and what is still blocked.
- The [regional statistics protocols](PRINT_REGION_STATISTICS.md) separately measure differences caused by processing, and sample variance across repeat captures. They do not change this diagnostic's status or exclusions.

## Supported model and domain

**What is measured.** One declared, coherent sine-wave fundamental, in one explicitly selected rectangular region of a scalar raster in **relative linear luminance**.

**The target.**

- It declares whole-number signed cycle counts `(kx,ky)` across the region dimensions `(W,H)`, and a positive reference modulation of at most one.
- Pixel index `(0,0)` is the centre of the region's first sample. The target's phase can be anything.
- At least one cycle count must be nonzero, and both frequency components must be strictly inside the Nyquist limit for their axis.
- DC and self-conjugate (Nyquist) frequency bins are unsupported. Two equal samples at Nyquist cannot establish the fundamental's amplitude independently of phase.

**The samples.**

- The caller supplies a dense row-major array for the region, of at most 65,536 finite values.
- Signed values are kept, because capture noise and processing can produce negatives.
- A positive DC mean that can be represented numerically is required to compute relative modulation.
- Successful parsing does not prove that a photograph actually shows the declared target, or that the acquisition is valid.

**Out of scope for this first model:** arbitrary photographs, non-periodic windows, automatic target detection, gamma-encoded luma, unknown luminance extraction, registration through correction or warping, and mixed or non-uniform target frequencies.

## Mathematical quantity

**Definitions.**

- `phi(x,y) = 2 pi (kx x/W + ky y/H)`
- `m = mean(samples)`
- `a = 2 mean(samples cos(phi))`
- `b = 2 mean(samples sin(phi))`

**Results.**

- Fundamental amplitude is `sqrt(a²+b²)`.
- Fundamental modulation is the amplitude divided by the (positive) mean `m`.
- The reported transfer **of the declared input grating** is that modulation divided by the reference modulation.

Values above one stay above one. They do not mean quality has improved, and they are not a validated MTF (modulation transfer function). One frequency does not determine a full response, MTF50, PSF, effective megapixels, perceived sharpness or a resolution limit. No defocus, diffraction or motion equation, and no conversion to blur diameter, is added.

**Residual.** The diagnostic also returns the RMS of what is left after fitting the mean and the fundamental, relative to DC. This is unexplained residual energy. It is not a noise variance, a halo classifier, a compression measure or a bound on model accuracy. Noise in one realisation can leak into the fundamental and bias the amplitude. No ensemble estimate, confidence value or combined uncertainty is made up.

**Numerical care.**

- Samples are normalised by their largest absolute value before the coefficients are accumulated.
- Compensated summation keeps corrections when large signed terms cancel.
- Any nonzero sample that underflows to zero during normalisation is rejected.
- The residual norm is accumulated with stable hypot operations, rather than squaring very small or very large residuals directly.
- Phase is reduced modulo one cycle before trigonometric functions are applied.
- Units are restored only for the mean and amplitude.

A non-positive DC, non-finite or underflowed restored quantities, or non-finite derived ratios give an unsupported numeric or domain state. Tiny nonzero energy is never clamped to an identity result, and tolerances are never loosened to manufacture a pass. Tolerances for transcendental functions belong to the independent test protocol, not to any quality decision.

## Region, stage and identity

**What the input records.**

- an assessment ID;
- the immutable capture ID;
- the exact representation ID and its declared SHA-256;
- the actual raster;
- the source stage;
- the processing or decoder ID and version;
- an optional noise-realisation ID;
- provenance of the reusable samples;
- the region's ID, rectangle and role;
- declared subject and focus distances (or an explicit null);
- the target's identity and version.

SHA-256 and provenance are declarations by the caller. The engine does not fetch the artifact, and does not check that a whole-file decode matches the region array. Keep this distinction in downstream evidence.

The returned frozen copy of the input includes the exact region samples. A new region, content, processing, target, or print and viewing conditions need a new assessment ID; matching labels alone do not prove the inputs are equal.

**Coordinates and stages.**

- Coordinates are in the oriented retained-image raster: top left, +X right, +Y down.
- Source stages are: native-retained linear, post-resampling linear, and post-encoding decoded linear.
- The native stage must match the authoritative retained native dimensions from the existing capture geometry.
- Later stages must keep exactly that aspect ratio, and must not enlarge either native axis.
- The first registration is oriented, retained and unwarped. Correction or warping needs an independently supported coordinate registration.

**Field position.** The existing geometry maps the region centre to the optical image plane (+Y up), keeping off-centre capture and crop and all four orientations. Field position is descriptive only; it does not create a field-dependent optical model. Only the explicitly selected region is measured. An intentionally out-of-focus background is never folded into a whole-frame verdict.

**Print size and viewing.** Printed dimensions and viewing distance come from `calculatePrintPlan()`; no new consumer equation is added.

- The region's fundamental frequency vector is converted to cycles/mm, using the region's physical span within the declared represented image.
- The diagnostic reports its physical period, and the exact angular period **at the normal viewing reference at the image centre**: `2 atan(period/(2 distance))`.
- This is the angle of a reference period. It is not an evenly spaced cycles-per-degree grid, an off-centre retinal calculation or a perceptual threshold.
- Field position and region location are kept separately.
- Changing viewing conditions changes the angular projection. It does not change the measured samples or modulation.

**Raster and encoding.** A result also says whether the assessed raster equals the current recommendation.

- A diagnostic before encoding never certifies JPEG compression.
- A declared post-encoding source records the exact artifact and decoder identity, but still does not validate compression, decoding, colour or overall quality.
- Actual delivery stays independent of native sufficiency.

## Assurance and explicit exclusions

The diagnostic reuses existing building blocks: calculation records, finite-number validation, strict allow-lists, the public-ID grammar, shared freezing of owned data, evidence provenance and composed scientific assurance.

- The mathematical coefficients are `calculated`.
- Whether the acquisition, registration and target are true stays scientifically unknown in this contract. Evidence metadata never promotes them to calibration.
- These result capabilities stay unassessed: captured MTF, attribution to optics, visibility and perceived quality, noise, aliasing, halos, compression and colour.
- No automatic print pass is offered.

**Errors.**

- Malformed structure or numbers throw the existing typed errors.
- Well-formed but incompatible identities, aspect ratio, stage or registration return blockers.
- Unsupported frequency, domain or numeric cases return an explicit unsupported status.
- Missing authoritative native geometry stays a blocker.
- Provider shortfalls and sampling shortfalls do not go away just because a regional contrast coefficient exists.

## References and reuse review

- [Boone, Yu and Seibert (1996), sinusoidal modulation measurement](https://pubmed.ncbi.nlm.nih.gov/8994160/), DOI 10.1118/1.597840: primary research motivating an explicit sinusoidal input, with its processing and sampling context. No commercial target, numeric table, PIRT code or procedure is copied or implemented.
- [Campbell and Robson (1968), grating visibility](https://physoc.onlinelibrary.wiley.com/doi/10.1113/jphysiol.1968.sp008574): primary research motivating keeping a Fourier coefficient separate from a validated perceptual model. No observer thresholds, curves or data are included.
- The Imatest sharpness guide cited in the issue is background terminology only. No proprietary algorithm, chart or source text is used.
- [Westheimer (1977), acuity and hyperacuity](https://pubmed.ncbi.nlm.nih.gov/839301/), DOI 10.1364/josa.67.000207, distinguishes resolution tasks from localisation tasks. It provides no universal print visibility threshold. No psychophysical thresholds or observer data are included.

All the specification, code, analytic targets and reference calculations were written independently. The numeric evidence is mathematical identities and procedural targets owned by Photivra; public references are used as factual references only. Real supplied sample arrays must be Photivra-owned or carry a declared reusable-data licence. No third-party numeric material, private assets or runtime dependencies are included. Human review of science, sources, licensing and DCO is still required. AI declarations alone do not certify provenance or patent clearance.

## Complete packed mathematical example

This procedural target, owned by Photivra, checks the coefficient calculation. It is not evidence from an acquired image or a renderer.

```ts
import { calculatePrintRegionDetail, type PrintRegionDetailInput } from "@photivra/engine";
const input: PrintRegionDetailInput = {
  assessmentId: "example-diagnostic",
  print: {
    source: { kind: "native-retained", captureId: "owned-example", geometry: {
      imagingArea: { widthMm: 32, heightMm: 32 },
      nativeRaster: { pixelWidth: 8, pixelHeight: 8 }, orientation: "landscape"
    } },
    printedImage: { width: 8, height: 8, unit: "inches" },
    viewingDistance: { value: 24, unit: "inches" },
    sampling: { kind: "manual-ppi", pixelsPerInch: 1 },
    fit: { kind: "confirmed-native-aspect", maximumRelativeAspectError: 0 }
  },
  source: {
    captureId: "owned-example", representationId: "owned-analytic-array",
    contentSha256: "a".repeat(64), raster: { pixelWidth: 8, pixelHeight: 8 },
    stage: "native-retained-linear", domain: "relative-linear-luminance",
    registration: "oriented-retained-unwarped",
    processing: { id: "owned-example", version: "0.1.0" }, noiseRealizationId: null,
    evidence: [{ sourceOrigin: "photivra", sourceReference: "owned-procedural-example", reuseStatus: "photivra-owned" }]
  },
  region: { id: "example-region", rect: { x: 0, y: 0, width: 8, height: 8 },
    role: "field-diagnostic", subjectDistanceM: null, focusDistanceM: null },
  target: { id: "quarter-period", version: "0.1.0", kind: "coherent-sinusoid",
    cyclesAcrossRegion: { x: 2, y: 0 }, referenceModulation: 0.5 },
  samples: Array.from({ length: 64 }, (_, i) => [1.5, 1, 0.5, 1][i % 4]!)
};
const assessment = calculatePrintRegionDetail(input).value;
if (assessment.status !== "diagnostic-only" || Math.abs(assessment.measurement!.fundamentalModulation - 0.5) > 1e-10) throw new Error("Unexpected analytic coefficient");
if (assessment.assurance.scientificStatus !== "unknown" || assessment.overallPrintVerdict !== "not-offered") throw new Error("Unexpected qualification");
console.log(assessment.measurement, assessment.unassessed);
```

The repeated `a` hash is an explicit placeholder, not a verified digest. Real acquired evidence must replace it with a verified hash of the exact representation, and must validate the target, region, processing and active backend independently.
