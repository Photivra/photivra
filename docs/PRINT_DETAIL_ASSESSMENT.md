# Regional Print detail diagnostic — model specification 0.1.0

This is the bounded mathematical first slice of #196, stacked on the unpublished [Print geometry candidate](PRINT_PLANNING.md). Geometry must be reviewed and published before downstream integration. This diagnostic is not full #196 acceptance, a natural-image sharpness evaluator, a visibility threshold or an overall print pass. The [validation protocol](PRINT_DETAIL_VALIDATION.md) and [capability ledger](validation/print-detail-capabilities.json) identify what is tested and what remains blocked.

## Supported model and domain

Measure one declared coherent sinusoidal fundamental in one explicitly selected rectangular region of a scalar **relative linear luminance** raster. The target declares integral signed cycle counts `(kx,ky)` across region dimensions `(W,H)` and positive reference modulation at most one. Pixel index `(0,0)` is the first region sample center. The target phase is arbitrary. At least one cycle count must be nonzero and both component frequencies must lie strictly inside the per-axis Nyquist interval. DC and self-conjugate/Nyquist bins are unsupported; two equal samples at Nyquist cannot establish phase-independent fundamental amplitude.

The caller supplies a dense row-major sample array for that region, at most 65,536 finite values. Signed values are retained; capture noise and processing can produce negatives. Successful parsing does not establish that a photograph actually depicts the declared target or that an acquisition is qualified. A positive numerically supported DC mean is required for relative modulation. Arbitrary photographs, nonperiodic windows, automatic target detection, gamma-encoded luma, unknown luminance extraction, correction/warp registration and mixed/nonuniform target frequencies are outside this first model.

## Mathematical quantity

Let `phi(x,y) = 2 pi (kx x/W + ky y/H)`, `m = mean(samples)`, `a = 2 mean(samples cos(phi))` and `b = 2 mean(samples sin(phi))`. Then fundamental amplitude is `sqrt(a²+b²)`, fundamental modulation is amplitude divided by positive `m`, and the reported transfer of the **declared input grating** is modulation divided by reference modulation. Values above one remain above one; they do not establish quality uplift or a qualified MTF. A single frequency does not determine a full response, MTF50, PSF, effective megapixels, perceived sharpness or resolution limit. No defocus/diffraction/motion equation or blur-diameter conversion is added.

Return the residual RMS after the fitted mean/fundamental, relative to DC. It is unexplained residual energy, not a noise variance, halo classifier, compression measure or model-accuracy bound. Realization noise can project into the fundamental and bias amplitude. No ensemble estimate, confidence or combined uncertainty is fabricated.

Normalize samples by their maximum absolute magnitude before coefficient accumulation, and use compensated summation that retains corrections when large signed terms cancel. Reject any nonzero sample that underflows to zero during normalization. Accumulate the residual norm with stable hypot operations rather than squaring tiny/large residuals directly. Reduce phase modulo one cycle before trigonometry. Restore units only for mean/amplitude. Nonpositive DC, nonfinite/underflowed restored quantities or nonfinite derived ratios produce an unsupported numeric/domain state; do not clamp tiny nonzero energy into identity or loosen tolerances to manufacture a pass. Transcendental conformance tolerances belong to the independent protocol, not to a quality decision.

## Region, stage and identity

The input records an assessment ID, immutable capture ID, exact representation ID and declared SHA-256, actual raster, source stage, processing/decoder ID and version, optional noise-realization ID, reusable sample provenance, region ID/rectangle/role, declared subject/focus distances (or explicit null), and target identity/version. SHA-256 and provenance are caller declarations; the engine neither fetches the artifact nor verifies full-file decoding from an ROI array. Retain this distinction in downstream evidence. The returned frozen owned input includes the exact ROI samples. New region, content, processing, target or print/viewing conditions require a new assessment ID; labels alone do not prove equality.

Coordinates are oriented retained-image raster coordinates, top-left, +X right, +Y down. Source stages are native-retained linear, post-resampling linear, and post-encoding decoded linear. Native stage must match the authoritative retained native dimensions from existing capture geometry. Later stages must preserve that exact aspect ratio and must not enlarge either native axis. The first registration is oriented retained, unwarped; correction/warp requires an independently supported coordinate registration. Existing geometry maps ROI center to the optical image plane (+Y up), preserving off-center capture/crop and all four orientations. Field position is descriptive and does not create a field-dependent optical model. Only the explicitly selected region is measured; an intentionally defocused background is never aggregated into a frame verdict.

Printed dimensions/viewing distance come from `calculatePrintPlan()`; no consumer equation is introduced. The regional fundamental vector converts to cycles/mm using ROI's physical span within the declared represented image. Report its physical period and the exact angular period **at the normal viewing reference at image center**: `2 atan(period/(2 distance))`. This is a reference-period angle, not a spatially uniform cycles/degree grid, an off-center retinal calculation or perceptual threshold. Retain field and ROI location separately. Changing viewing conditions changes angular projection, not measured captured samples/modulation.

A result also states whether the assessed actual raster equals the current recommendation. A pre-encoding diagnostic never certifies JPEG compression. A post-encoding declared source records the exact artifact/decoder identity but still does not qualify compression, decoding, color or overall quality. Actual delivery remains independent of native sufficiency.

## Assurance and explicit exclusions

Use existing calculation envelopes, finite-number validation, strict allowlists, public-ID grammar, shared owned-data freezing, evidence provenance and composed scientific assurance. Mathematical coefficients are calculated. Acquisition/registration/target truth remain scientifically unknown in this contract; evidence metadata never promotes them to calibration. Result capabilities for captured MTF, optical attribution, visibility/perceived quality, noise, aliasing, halos, compression and color remain unassessed. No automatic print pass is exposed.

Malformed structural/numeric data throw typed existing errors. Well-formed incompatible identities, aspect, stage or registration return blockers; unsupported frequency/domain/numeric cases return explicit unsupported status. Missing authoritative native geometry remains a blocker. Provider shortfalls and sampling shortfalls do not disappear when a regional contrast coefficient exists.

## References and reuse review

- [Boone, Yu and Seibert (1996), sinusoidal modulation measurement](https://pubmed.ncbi.nlm.nih.gov/8994160/), DOI 10.1118/1.597840: primary research motivating explicit sinusoidal input, processing and sampling context. No commercial target, numeric table, PIRT code or procedure is copied or implemented.
- [Campbell and Robson (1968), grating visibility](https://physoc.onlinelibrary.wiley.com/doi/10.1113/jphysiol.1968.sp008574): primary research motivating the separation of a Fourier coefficient from a qualified perceptual model. No observer thresholds/curves/data are incorporated.
- The issue's Imatest sharpness guide is background terminology only. No proprietary algorithm, chart or source expression is used. [Westheimer (1977), acuity and hyperacuity](https://pubmed.ncbi.nlm.nih.gov/839301/), DOI 10.1364/josa.67.000207, distinguishes resolution and localization tasks; it supplies no universal print visibility threshold. No psychophysical thresholds or observer data are incorporated.

All specification, code and analytic targets/reference calculations are independently authored. Mathematical identities and self-owned procedural targets are the numeric evidence; public references are factual-reference-only. Actual supplied sample arrays require Photivra ownership or declared reusable-data licensing. No third-party numeric material, private assets or runtime dependencies are incorporated. Human scientific/source, licensing and DCO review remains required; AI declarations alone do not certify provenance or patent clearance.

## Complete packed mathematical example

This self-owned procedural target validates the coefficient path; it is not acquired-image or renderer evidence.

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

The repeated `a` hash is an explicit placeholder declaration, not a verified digest. Real acquired evidence must replace it with a verified exact representation hash and qualify the target/ROI, processing and active backend independently.
