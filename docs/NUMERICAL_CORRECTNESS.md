# Numerical Correctness and Physical Units

Release context (dated historical note): this page was written for the **package 1.2.0 candidate / root API 1.2.0**. It has not been re-reviewed for later releases; see the [changelog](../CHANGELOG.md) for the current release. Subsystem and model versions, and dated introduction or measurement records below, are independent historical identities. They are not distribution versions. See [developer navigation](DEVELOPERS.md) and the [release contract](RELEASE_1_2_0.md).

Photivra is a scientific engine. How numbers behave, and which physical unit they carry, are part of the public contract. They are not implementation details.

This page sets the numerical policy for the whole repository: public calculations, parsers, schemas, tests and composed image-formation work.

## Core rules

- Public physical quantities put the unit in the field name, unless the type itself clearly owns the unit.
- The same physical concept uses the same unit and property name in every module.
- The coordinate system is part of what a quantity means. Two numbers are not interchangeable just because they have the same unit.
- Public calculation results must stay JSON-safe. `NaN` and numeric infinities are not valid outputs.
- Invalid scientific inputs fail explicitly. They are never silently clamped, coerced, defaulted or reinterpreted.
- Unknown, unbounded, absent and unsupported states are represented by meaning (for example `null` or a named state), not by magic sentinel numbers.
- Unit conversion happens exactly once, at an explicit boundary.
- A mathematical simplification must not erase axis dependence, sign conventions, the physical stage, provenance or applicability.

These rules add to `docs/API_STYLE.md` and to the coordinate and model rules in `docs/PHYSICS_FOUNDATION.md`.

## Canonical public units

Photivra does not require one internal, SI-only representation. It does require explicit, stable units at public boundaries.

Common conventions:

| Quantity | Public convention |
| --- | --- |
| focal/image/sensor distances | millimetres when named `*Mm` |
| scene/object/focus distance | metres when named `*M` |
| sampling pitch | micrometres when named `*Micrometers` |
| time / exposure duration | seconds when named `*Seconds` |
| wavelength | nanometres when named `*Nanometers` / `*Nm` |
| angle | explicit radians/degrees fields, never an unlabeled angle |
| ISO / exposure index | dimensionless named camera setting |
| normalized factors / weights | dimensionless; document normalization and valid range |
| spectral irradiance | explicit radiometric unit including wavelength-density basis |
| irradiance | W/m² when physically calibrated |
| radiance | W/m²/sr, with /nm when spectrally resolved |
| electrons / photons / RAW codes | explicit domain-specific counts/codes; do not interchange |

If a public field name or type is ambiguous, do not guess its unit from neighbouring fields or from documentation.

## Coordinate identity

A physical unit alone does not identify a coordinate.

For example, these are all different domains, even when they are all in millimetres or pixels:

- native sensor raster coordinates;
- oriented capture raster coordinates;
- output raster coordinates;
- optical image-plane coordinates;
- sensor physical coordinates;
- scene/world coordinates.

Moving between coordinate systems needs an explicit exported transform or a documented model boundary. Do not write ad-hoc sign changes, axis swaps, recentering or crop-local reinterpretation.

## Finite-number policy

Public calculation envelopes must not contain non-finite numbers.

The `CalculationResult<T>` constructors check every returned number, recursively. If a calculation would return `NaN`, `Infinity` or `-Infinity`, it fails with `InvalidScientificResultError`.

Inputs that must be finite fail with a typed domain validation error before the calculation runs.

When the scientific state really is unbounded, represent it by meaning. Example: depth of field uses `null` for an infinite far limit, not numeric `Infinity`.

Do not rely on JSON serialization to convert or hide non-finite numbers.

## Domains and ranges

Validation should tell these four kinds of check apart:

1. **structural validity** — correct type, shape and discriminant;
2. **numeric validity** — finite, integer, nonnegative, positive, a bounded fraction, and so on;
3. **scientific applicability** — the value is inside the model, profile or calibration operating range;
4. **composition compatibility** — inputs that are each valid are also valid together.

Do not silently widen a model's operating range to accept a caller's value.

For reusable bounded ranges:

- state the units;
- state whether the endpoints are inclusive;
- reject reversed ranges;
- keep exact evidence and applicability when calibrated;
- do not extrapolate unless the model explicitly defines and labels extrapolation.

## Exact equality vs tolerance

Photivra has no single global epsilon.

Use exact equality when the contract is exact, for example:

- IDs, versions, enum and discriminant values;
- integer and raster identities;
- explicit zero or no-op states, when they are represented exactly;
- deterministic serialized or canonical structures where bitwise identity is part of the contract;
- algebraic results that the implementation should compute exactly in the arithmetic used.

Use a documented tolerance when floating-point evaluation is inherently approximate, for example:

- transcendental functions;
- iterative numerical methods;
- quadrature (numerical integration);
- interpolated calibration data;
- numerically sensitive inverse mappings.

Choose each tolerance from the quantity, its numerical scale, the conditioning, the algorithm and the scientific claim. Never loosen a tolerance just to hide a regression you cannot explain.

Prefer:

- an absolute tolerance near a known scale or near zero;
- a relative tolerance for quantities that scale proportionally;
- convergence or refinement tests for sampled numerical methods;
- independently derived analytical or reference values, where they exist.

## Rounding and quantization

Rounding that changes the stored data is a scientific or output operation, not a cosmetic one.

- Keep calculations at the highest practical deterministic precision until a defined output boundary.
- Make pixel and raster integer rounding rules explicit. Whole-pixel crop sizes take the floor of the quotient. They snap up only when the quotient lies within 4 ulps (units in the last place) below the next integer — rounding noise from the divisor, for example 4480 / (7/3). A genuine fraction is never rounded up (crop model 2.0.0).
- RAW and export quantization must define the scale, offset/black level, clipping, rounding and tie behaviour, and code range.
- Do not round intermediate physical values to make them look nicer.
- Do not let a serializer or container limit redefine the authoritative scientific value.
- Encoded file bytes must not depend on the JavaScript engine's `Math` library.
  - The baseline JPEG encoder uses a fixed table of correctly rounded DCT cosines (`JPEG_DCT_COSINES`), and rounds quantized coefficients half away from zero.
  - The Print JPEG rounds encoded sRGB codes to nearest, ties up, with `Math.round`. It does not use `Math.floor(x + 0.5)`, which rounds 0.49999999999999994 up.

  See [Photographic export](PHOTOGRAPHIC_EXPORT.md).

## Signed zero and tiny values

Do not use `-0` to mean anything.

When a public result is mathematically zero and signed zero could leak into serialization or identity, normalize or test it as its owning model says. Do not blindly clamp small non-zero values to zero; that needs a documented model or tolerance decision.

## Overflow, underflow, and extreme inputs

Public functions must fail safely when arithmetic leaves the valid numerical or scientific domain.

- A finite input does not guarantee a finite result.
- Check derived values where overflow or invalid denominators can happen.
- Avoid transformations that turn a detectable invalid state into a finite number that looks plausible.
- Extreme-value tests should target the model's boundary, not just arbitrary machine limits.

If a numerically more stable reformulation is needed, it must keep the documented scientific model and provenance.

## Determinism and runtime expectations

For identical validated inputs and fixed random seeds, the engine should give deterministic scientific results within the documented contract.

Do not depend on:

- object iteration order that is not part of the serialized contract;
- the current wall-clock time;
- random state without an explicit seed;
- network or service responses;
- renderer or UI state;
- hidden, machine-specific calibration.

Browser-safe public code and supported Node runtimes must give the same result contract. If an implementation allows small floating-point differences between runtimes, the acceptance tolerances must be explicit and scientifically harmless.

## Cross-engine determinism

JavaScript engines agree bit-for-bit on some operations and not on others.

- ECMAScript requires `+`, `-`, `*`, `/` and `Math.sqrt` to be correctly rounded IEEE 754 binary64 operations. A fixed sequence of them gives identical bits in V8 (Chrome, Node), JavaScriptCore (Safari, Bun) and SpiderMonkey (Firefox).
- `Math.hypot`, `exp`, `log`, `cbrt`, `sin`, `cos`, `tan`, `atan`, `acos` and the other transcendental functions are approximated by each engine and can differ in the last bit. Measured for package 2.0.0 between Node 24 and Bun 1.4: about a third of two-argument `Math.hypot` calls, and 1–10% of calls to the other functions, differed. `**`/`pow` matched on every tested input.

Rules from package 2.0.0:

- A value that is both stored **and** re-derived for an exact identity check on parse must be computed only from correctly rounded operations. For such values, `portableHypot()` in `src/core/portable-math.ts` replaces `Math.hypot`. It rescales by exact powers of two, so it neither overflows nor depends on the engine.
- The diagonal 35 mm crop factor is `√(1872 / (w² + h²))`, and the imaging-area diagonal is `portableHypot(w, h)` (`calculateImagingAreaMetrics`). The stored `equivalentFocalLength35Mm` is therefore the same in every engine. Scalar diagonals in circle-of-confusion scaling, the POC response, and camera-shake/projected-motion distances also use `portableHypot`.
- Parsers that re-derive a floating-point value compare it within a few ulps instead of with `!==`. `parseSimulatedCapture` and packed-RAW validation (`createNativeRawDevelopmentTask`) accept an archived `equivalentFocalLength35Mm` within 8 ulps of the re-derived value, and return the re-derived value. This also accepts records written by releases before 2.0.0, which used `Math.hypot`.
- Integer, string, enum and structural identities stay exact.

- `**`/`pow` also differs between V8 versions: Node 22 (V8 12) and Node 24 (V8 13) differ in the last bit of about 10 % of `x ** (1/2.4)` and of integer powers such as `x ** 5` (measured for 2.6.0 on 200 000 arguments each; `exp`, `log`, `cbrt`, `sin` and `cos` agree between them). Because the 8- and 16-bit sRGB codes are rounded from `1.055·x ** (1/2.4) − 0.055`, 57 of the 255 8-bit and 14 968 of the 65 535 16-bit code boundaries sit 1–2 ulps apart on the two: a linear value exactly there gets codes one apart. No tested capture has hit one; the hash locks and the facade fingerprints are identical on Node 22, 24 and 26.
- From 2.6.0, `src/core/portable-math.ts` also has a portable logarithm, exponential, power, cube root, e^x − 1 and cosine/sine of 2πu (`portableLog`, `portableLog2`, `portableExp`, `portableExp2`, `portableExpm1`, `portablePow`, `portableCbrt`, `portableCosTwoPi`, `portableSinTwoPi`): fixed sequences of correctly rounded operations, within 1 ulp (2 for e^x − 1, cos and sin) of the exact functions. A test locks one digest of 49 152 of their results, the same on Node 22, 24 and 26, Chromium 141 and 153 and Bun (JavaScriptCore). The display view uses them for its own arithmetic and its illuminant ([display view](DISPLAY_VIEW.md), "Same bytes in every engine"); captures keep `Math` and `**`.

**Engine-portable identities** (equal bits for equal inputs in every conforming engine):

- the simulated-capture and packed-RAW metadata identities;
- crop and raster geometry;
- seeds (`Math.imul`/fmix32 only);
- RAW codes from the integer-safe noise and ADC paths (verified identical for a 512×512 native RAW task in Node and Bun);
- every export identity derived from them — `rawDataUniqueId`, `simulationHash` and the DNG/JPEG SHA-256 values (verified identical in Node and Bun for a 23.6 × 15.7 mm sensor at 18 mm, which differed before 2.0.0).

**Not guaranteed bit-identical across engines:** continuous results that pass through a transcendental function, such as field-of-view angles, rotation and distortion mappings, PSF (point-spread function) kernels and tone curves.

- They agree within a few ulps.
- A quantized output (a RAW code, or an 8/16-bit sample) can differ only when a value lies within that rounding noise of a quantization boundary.
- Hashes over such continuous results, including `simulatePocCamera()` response hashes, are engine-specific.
- Tests that pin them compare discrete fields exactly and numbers within a stated ulp tolerance. The 64-case POC corpus uses 8 ulps (`test/poc-projection-reuse.test.ts`) and passes under Node and Bun. The per-platform hash override it replaced is kept as history in [POC projection reference on macOS ARM64](POC_PROJECTION_PLATFORM_REFERENCE.md).

### Test hash locks and platforms

Some regression tests lock exact engine output with SHA-256 digests. They prove that a refactor is bit-identical. They are not scientific evidence. Each one sits next to independently derived spot values, so a digest change can be traced to a specific quantity:

| Test | Locked output | Independent spot values beside it |
| --- | --- | --- |
| `test/native-environment-bit-identity.test.ts` | float64 photo expectations, RAW codes, developed samples | camera-equation photon/electron counts, provider-evaluation counts |
| `test/stabilization-evaluation-identity.test.ts` | every IEEE-754 bit of stabilized trajectories and temporal nodes | controller residuals, rolling-window midpoint times and weights |
| `test/canonical-json-identity.test.ts` | simulation hash, RAW data id, DNG and JPEG bytes | re-derived canonical-JSON hashes, TIFF/DNG tags and strip, JPEG markers |
| `test/jpeg-reference-byte-parity.test.ts` | 18 reference JPEG byte streams | — |
| `test/poc-projection-reuse.test.ts` | historical POC responses (discrete fields exact, numbers within 8 ulps) | see "Cross-engine determinism" above |

- The digests were recorded with Node.js on Linux x64 (V8). That is the only platform the required CI gate runs.
- Digests over continuous results are engine-specific (see "Cross-engine determinism" above), so they are not guaranteed to carry over to other platforms.
- The informational `hash locks (macos-latest)` CI job runs these five tests on macOS without blocking the gate. Windows and linux-arm64 are not tested.
- A digest that differs only on another platform is a portability finding to investigate. It is not a reason to regenerate the Linux value.
- The `print-*` fixture digests hash checked-in input files, not engine output, so they do not depend on the platform.

## Testing requirements

Numerical tests should use the strongest form that applies, in this order:

1. exact identity or invariant;
2. independently derived analytical constant;
3. dimensional or unit relation;
4. monotonic or bounded behaviour;
5. round-trip or inverse invariant;
6. numerical convergence or refinement;
7. calibrated or reference tolerance, with provenance.

Once available, the canonical `test/fixtures/basic-reference-scene.json` fixture is the preferred shared reference for deterministic cases that span domains.

Do not produce the only expected value by calling the same production function that is under test.

For browser-first dense-pupil native capture, the [numerical acceptance and evidence matrix](BROWSER_NATIVE_CAPTURE_NUMERICAL_ACCEPTANCE.md) applies these repository-wide rules to stable evidence IDs. It does not replace this policy, and it does not set universal tolerances for unrelated engine calculations.

## Changes to numerical behavior

A change that alters the meaning of a public number must document:

- the equation or model change;
- units and coordinate system;
- assumptions and applicability;
- old versus new behaviour;
- the effect on tolerance and precision;
- the effect on API, schema and version;
- the consequences for provenance and uncertainty;
- migration implications, when relevant.

A pure implementation optimization must keep the same scientific result and provenance within the existing contract.

For browser-native dense-pupil work (issues #224/#233), the [Path-B adoption and version gate](BROWSER_NATIVE_CAPTURE_PATH_B_ADOPTION.md) defines when a numerical change stops being a pure Path-A optimization. Changes to sampling, coverage or filtering, weights, estimator or stopping rules, or reproducibility/exactness classes need Path-B governance. They must not be handled by relaxing a tolerance after the fact.
