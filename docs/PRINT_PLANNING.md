# Native-only Print planning

Release candidate: package/root API **1.1.0**, Print model **0.1.0**. This standalone browser-safe API answers native sampling sufficiency and the minimum compatible printer-file raster. It generates no pixels or files. See [API conventions](API_STYLE.md), [staged geometry](PHYSICS_FOUNDATION.md), [processed output](PROCESSED_OUTPUT.md) and [release review](RELEASE_1_1_0.md).

## Authority and units

`source.kind: "native-retained"` declares an authoritative native grid and public capture ID. The planner validates geometry, not the truth of that declaration. Callers must bind it to the retained capture, never to a resized preview or processing enlargement. Existing `resolveCaptureGeometry()` owns orientation, native active capture, off-center output crop and optical-axis semantics. Available pixels are its **output crop dimensions**, before `outputRaster` resampling. Print planning changes no captured physics.

`printedImage` is the flat physical image area: excludes paper, borders and wrap. Lengths explicitly use mm, cm, inches or metres. An inch is exactly 25.4 mm. PPI counts image samples per printed inch; printer DPI, encoded byte size, JPEG quality, paper and ICC behavior are separate. Actual delivery, resource limits and perceived/source-detail quality remain `unassessed`.

## Angular convention and equation

Viewing distance is independent of image size. At normal viewing of a flat image, a centered pixel of physical pitch `p` at distance `d` subtends `theta = 2 atan(p / (2d))`. In radians, `p_max = 2d tan(theta_max/2)` and `derived PPI = 25.4 / p_max` for millimetres. No small-angle approximation is substituted. Positive effective angles below 180 degrees are accepted mathematically; this broad geometry domain does not establish a visual-acuity model or useful guidance for extreme angles.

Choose a convention explicitly:

| Kind | Maximum effective pixel angle |
| --- | --- |
| `angular-pixel-pitch` | `maximumArcminutesPerPixel` |
| `angular-stroke` | `strokeWidthArcminutes / samplesPerStroke` |
| `angular-line-pair` | `periodArcminutes / samplesPerPeriod` |
| `manual-ppi` | No angular criterion; explicit independent density |

Stroke/period conventions divide the declared angular budget by the sample count by definition; they do not calculate the exact physical subdivision of a finite optotype on a flat image. That distinction matters for large angular extents. The exact centered-pixel equation then applies to the resulting per-pixel budget. Stroke sampling requires a positive integer sample count. A line-pair period includes a light and a dark stroke and requires at least two samples. A two-arcminute line pair with two samples is one arcminute per pixel; a one-arcminute period with two samples is half that pitch. Two samples are a declared sampling minimum, not a promise of preserved contrast. No acuity, universal 300 PPI, hidden safety multiplier or pixel-invisibility threshold is assumed. At 24 inches, a declared one-arcminute pixel criterion gives approximately 143.239447773 PPI. Angular guidance has `approximation` provenance because its use as a perceptual criterion is uncalibrated; the geometry envelope remains `calculated`. Manual PPI starts a new plan and certifies no previous angular criterion.

## Integer policy, fit and sufficiency

The first policy preserves the **exact retained native raster aspect ratio**. Reduce native dimensions `(W,H)` by their greatest common divisor to integer `(a,b)`. For continuous required counts `(Rx,Ry)`, choose `k = max(1, ceil(Rx/a), ceil(Ry/b))`, then output `(ka,kb)`. This is the minimum sufficient integer raster **within the declared exact-ratio family**, not the unconstrained independently rounded pair. Coprime crop dimensions can require retaining the whole native grid even for a low-density request; this limitation is explicit. No search or hidden stretch is performed.

The physical printed-image ratio must agree with the confirmed crop within caller-declared `maximumRelativeAspectError` in `[0,0.01]`. Relative error is `abs((imageWidth/imageHeight)/(W/H) - 1)` and is returned. Zero demands exact represented equality. Nonzero tolerance explicitly accepts that small physical pitch difference between axes; per-axis achieved PPI and angular pitch expose it. Output resizing always uses one equal scale on both axes. An aspect mismatch returns `crop-confirmation-required`; choose and confirm a different crop or physical image size before replanning. The engine never silently crops or stretches.

Compare the same minimum raster with native retained supply on **both axes**. `sufficient` describes only coverage under the declared criterion. A shortfall yields no recommendation. Never count upsampled pixels as capacity. The recommendation reports integer raster, achieved PPI/angle and equal native resampling scales, all in the same model/API result. Output may only downsample or preserve native resolution.

## Lab constraints, alternatives and bounds

Optional lab minimum/exact raster and minimum/exact PPI constrain delivery separately from angular guidance. All declared constraints are reconciled. Exact density must produce integral dimensions; exact raster must preserve native ratio, meet sampling/lab minima and not exceed either native axis. Contradiction or enlargement returns `provider-conflict` and no recommendation, even when native angular sufficiency is `sufficient`. The caller owns factual vendor requirements and downstream file validation; omission means unknown, not a universal lab default. Compatible lab minima may increase the minimum recommendation.

Alternatives report an aspect-preserving maximum image size at current distance and, for angular plans, a minimum distance at current image size. They retain the criterion and native supply. These are **sampling alternatives**; lab constraints require a new full plan and may remain conflicting. Manual density has no farther-distance solution. Boundary alternatives round outward by adjacent binary64 values and recheck the integer policy (at most eight steps); unsupported numerical cases return a blocker. This is representational rounding, not relaxed sampling or a safety factor.

`calculatePrintSizeLimit()` uses a reference plan and explicit distance policy. Fixed distance gives a finite conditional sampling bound. Proportional scaling of both image axes and distance leaves angular pixel pitch unchanged: the bound is `unbounded` if the reference meets the criterion, otherwise `no-positive-size`. Manual PPI supplies an independent finite bound. Size queries with lab constraints are explicitly `unsupported` in model 0.1.0; evaluate individual plans instead. No infinity sentinel is serialized and no finite printer/substrate bound is invented.

Malformed, unknown, zero, nonfinite or invalid inputs throw existing typed configuration/scientific errors. Missing native authority gives `cannot-assess`. Positive finite requests whose converted lengths, pitches, densities, diagnostics or safe-integer output cannot be represented give `unsupported`. Calculations use binary64; conservative ceil can change an exact mathematical angular boundary by a ratio unit. Manual count calculations preserve directly supplied inches rather than round-trip through pitch. No global epsilon turns a failed sampling criterion into success. Results contain only finite numbers and null semantic absences.

## Complete packed example

```ts
import { calculatePrintPlan, calculatePrintSizeLimit, type PrintPlanInput } from "@photivra/engine";
const input: PrintPlanInput = {
  source: { kind: "native-retained", captureId: "example-capture", geometry: {
    imagingArea: { widthMm: 32, heightMm: 18 },
    nativeRaster: { pixelWidth: 2560, pixelHeight: 1440 }, orientation: "landscape"
  } },
  printedImage: { width: 16, height: 9, unit: "inches" },
  viewingDistance: { value: 24, unit: "inches" },
  sampling: { kind: "angular-pixel-pitch", maximumArcminutesPerPixel: 1 },
  fit: { kind: "confirmed-native-aspect", maximumRelativeAspectError: 1e-12 }
};
const plan = calculatePrintPlan(input).value;
if (plan.status !== "ready" || plan.recommended?.raster.pixelWidth !== 2304 || plan.recommended.raster.pixelHeight !== 1296) throw new Error("Unexpected print raster");
const bound = calculatePrintSizeLimit({ plan: input, viewingDistancePolicy: "proportional-to-image-size" }).value;
if (bound.status !== "unbounded") throw new Error("Unexpected size bound");
console.log(plan.native?.pixelsPerInch, plan.recommended, bound.status);
```

For untrusted requests use `parsePrintPlanInput()`. Calculation functions also parse/copy their inputs. No private assets, framework types, runtime dependencies, telemetry or source-plane reads are required. Preserve the returned capture/input/model/API binding when assembling output metadata; this API does not itself invoke the existing image exporter or attach serialization tags.

## References and evidence

- [NIST length units](https://www.nist.gov/pml/owm/si-units-length): unit conversion reference.
- [Adobe image resolution](https://helpx.adobe.com/photoshop/desktop/crop-resize-transform/resize-adjust-resolution/printed-image-resolution.html): physical image dimensions versus pixel density.
- [University of Iowa acuity testing](https://webeye.ophth.uiowa.edu/eyeforum/video/Refraction/Visual-Acuity-Testing/index.htm): optotype critical stroke detail is distinct from a whole optotype. This motivates explicitly declared conventions; it supplies no universal print sampling/quality guarantee.

Implementation, prose and tests are original. References informed terminology and equations; no source tables, calibration, datasets or protected expression were incorporated. Independent tests cover the 160-PPI identity, high-precision angular reference, all orientations/off-center crop, ignored preview enlargement, unit and one-pixel boundaries, exact-ratio minimum search with fixed seed, lab conflicts, manual overrides, semantic bounds and invalid/extreme finite JSON. Human scientific/source/DCO review remains required before release. Advanced captured-detail/quality assessment remains separate (#196).
