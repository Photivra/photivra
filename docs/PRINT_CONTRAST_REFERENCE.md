# Static neutral Print contrast reference — model 0.1.0

`calculatePrintContrastReference()` evaluates a restricted static, foveal, neutral D65 Gabor reference from castleCSF. This is an **estimated population-model reference**, separate from measured regional detail and sampling sufficiency. It does not classify a photograph, promise invisibility, establish personal acuity or produce an overall Print verdict. Actual stimulus matching remains unassessed.

## Model and source review

The numerical source is [castleCSF revision f4b0b722af83001d7af979281e06ca642d36e4e8](https://github.com/gfxdisp/castleCSF/tree/f4b0b722af83001d7af979281e06ca642d36e4e8), including `CSF_castleCSF.m`, `CSF_stelaCSF_lum_peak.m`, `CSF_castleCSF_chrom.m` and `CSF_base.m`. These code files contain the model equations, numerical parameters, neutral D65 background and mechanism projections. The repository license is MIT, copyright 2023 Graphics and Displays group, University of Cambridge. Retain the [exact license](licenses/castleCSF-MIT.txt), copyright in source and `NOTICE`, and the inventory in `THIRD_PARTY.md`. The scalar TypeScript adapter and independent high-precision evaluator are newly authored; the numerical model material is third-party material, not asserted to be Photivra-owned calibration.

The [primary paper, Ashraf et al. (2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10996938/) describes sensitivity as a function of stimulus conditions and reports population-model validation. Its fixed-size static achromatic Gabor reference is relevant to this restricted stimulus. We do not reproduce the paper, tables, figures or observational datasets. No CSV from the combined historical datasets is included; their reuse/collection history is not inferred from the code license. Source/license review of this new numerical material remains a substantive human release gate.

## Explicit conditions and quantities

Every input must explicitly identify the stimulus and published binocular/natural-pupil reference assumption. The implemented numerical envelope is mean luminance **1–1000 cd/m²**, carrier frequency **0.25–16 cycles/degree**, Gaussian envelope sigma **exactly 1.5 degrees**, temporal frequency **zero** and eccentricity **zero**. These are model-evaluation limits, not a calibration certificate covering every observer or combination. Positive values outside this envelope yield `unsupported`, not extrapolation. Michelson modulation is a supplied fraction in `[0,1]`; luminance is not inferred from capture exposure, a display percentage, paper whiteness or image RGB.

Equal fractional modulation of the upstream neutral D65 LMS background is selected. Retain the achromatic sustained/transient responses and both opponent-mechanism projections; the neutral background has small nonzero opponent projections. Static temporal response and the Gaussian effective area `pi sigma²` follow the pinned model. Evaluate luminance-dependent hyperbolic terms using log1p/expm1 to retain the small saturation term. This is scalar evaluation of the mathematical equations, rather than bit-for-bit emulation of MATLAB's cancellation in `1 - power(...)`.

Return sensitivity, its reciprocal threshold modulation, and supplied modulation divided by that threshold. They remain continuous model quantities. The API offers no `visible`, `invisible`, `pass`, personal-vision score or automatic print-quality recommendation. It neither combines independent image-quality dimensions nor maps a Fourier residual/noise RMS into a Gabor contrast. Fitted population variation and upstream fit errors do not supply an individual confidence interval. Uncertainty remains explicitly unquantified.

## Independent numerical protocol

The committed [reference generator](../test/fixtures/print-detail/generate_contrast_reference.py) evaluates the scalar equations with Python standard-library Decimal at 80 digits, using direct hyperbolic powers, an independently arranged area term and exact decimal parameters. It imports no engine output. The [reference artifact](../test/fixtures/print-detail/contrast-reference.json) covers 35 luminance/frequency points. SHA-256, source revision, protocol and conditions are checked by the public-root test. Compare sensitivity and threshold with relative arithmetic tolerance `1e-12`; this is numerical conformance, not an observer-accuracy claim. Tests also cover domain boundaries, immutable copied input, explicit zero contrast, malformed conditions and absence of a visibility verdict.

Neither the upstream MATLAB runtime nor new observer experiments have been executed by this protocol. Upstream empirical results provide a research basis, and the independent Decimal reference qualifies this scalar evaluation only. Actual photographic/printed-stimulus transfer, masking, age/ocular differences, absolute print luminance, color, glare, eccentricity, temporal presentation and viewing-device qualification remain separate. The coherent rectangular grating diagnostic is not a Gaussian-envelope stimulus; its modulation cannot be passed off as matched Gabor evidence. #196's full scoped acquisition/perceptual acceptance remains open until the capability ledger records the missing evidence and substantive human review.

## Complete public example

```ts
import { calculatePrintContrastReference } from "@photivra/engine";
const reference = calculatePrintContrastReference({
  referenceId: "example-population-reference", stimulus: "static-neutral-d65-gabor",
  observer: "published-binocular-natural-pupil-reference",
  meanLuminanceCdPerSquareMeter: 50, spatialFrequencyCyclesPerDegree: 4,
  gaussianEnvelopeSigmaDegrees: 1.5, temporalFrequencyHz: 0,
  eccentricityDegrees: 0, modulationMichelson: 0.01
}).value;
if (reference.status !== "model-estimate" || !reference.estimate) throw new Error("Unexpected reference domain");
if (reference.naturalImageVisibility !== "unassessed" || reference.overallPrintVerdict !== "not-offered") throw new Error("Unexpected quality claim");
console.log(reference.estimate, reference.observerApplicability);
```

This evaluates a declared reference stimulus. It is not evidence that an actual photograph or print meets those stimulus/observer conditions.
