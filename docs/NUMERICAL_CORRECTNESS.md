# Numerical Correctness and Physical Units

Release context: **package 1.2.0 candidate / root API 1.2.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

Photivra is a scientific engine. Numerical behavior and physical-unit meaning are public-contract concerns, not implementation details.

This document defines the repository-wide numerical policy used by public calculations, parsers, schemas, tests, and composed image-formation work.

## Core rules

- Public physical quantities must use explicit units in field names unless the type itself unambiguously owns the unit.
- The same physical concept should use the same unit and property name across modules.
- Coordinate-system identity is part of the quantity definition. A number is not interchangeable merely because it has the same dimensional unit.
- Public calculation results must remain JSON-safe. `NaN` and numeric infinities are not valid calculation outputs.
- Invalid scientific inputs fail explicitly rather than being silently clamped, coerced, defaulted, or reinterpreted.
- Unknown, unbounded, absent, and unsupported states must be represented semantically rather than by magic numeric sentinels.
- Unit conversion happens exactly once at an explicit boundary.
- Mathematical simplifications must not erase axis dependence, sign conventions, physical stage, provenance, or applicability.

These rules supplement `docs/API_STYLE.md` and the coordinate/model rules in `docs/PHYSICS_FOUNDATION.md`.

## Canonical public units

Photivra does not require one internal SI-only representation. It does require explicit, stable units at public boundaries.

Common conventions include:

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

Do not infer units from neighboring fields or documentation when the public field name/type is ambiguous.

## Coordinate identity

A physical unit alone does not identify a coordinate.

For example, these are different domains even when expressed in millimetres or pixels:

- native sensor raster coordinates;
- oriented capture raster coordinates;
- output raster coordinates;
- optical image-plane coordinates;
- sensor physical coordinates;
- scene/world coordinates.

Crossing coordinate systems requires an explicit exported transform or a documented model boundary. Do not implement ad-hoc sign changes, axis swaps, recentering, or crop-local reinterpretation.

## Finite-number policy

Public calculation envelopes must not contain non-finite numbers.

The existing `CalculationResult<T>` constructors recursively validate returned numeric values. If a calculation would emit `NaN`, `Infinity`, or `-Infinity`, it fails with `InvalidScientificResultError`.

Inputs that are required to be finite must fail with a typed/domain validation error before the calculation proceeds.

When the scientific state is genuinely unbounded, represent that state semantically. Example: depth of field uses `null` for an infinite far limit rather than numeric `Infinity`.

Do not rely on JSON serialization to convert or erase non-finite numbers.

## Domains and ranges

Validation should distinguish:

1. **structural validity** — correct type/shape/discriminant;
2. **numeric validity** — finite, integer, nonnegative, positive, bounded fraction, etc.;
3. **scientific applicability** — value lies inside the model/profile/calibration operating range;
4. **composition compatibility** — independently valid inputs are valid together.

Do not silently widen a model's operating envelope to accept a caller value.

For reusable bounded ranges:

- state units;
- state whether endpoints are inclusive;
- reject reversed ranges;
- preserve exact evidence/applicability when calibrated;
- do not extrapolate unless the model explicitly defines and labels extrapolation.

## Exact equality vs tolerance

Photivra does not use one global epsilon.

Use exact equality when the contract is exact, including:

- IDs, versions, enum/discriminant values;
- integer/raster identities;
- explicit zero/no-op states when represented exactly;
- deterministic serialized/canonical structures where bitwise identity is part of the contract;
- algebraic results whose implementation is expected to be exact in the represented arithmetic.

Use a documented tolerance when floating-point evaluation is inherently approximate, including:

- transcendental functions;
- iterative numerical methods;
- quadrature/integration;
- interpolated calibration data;
- numerically conditioned inverse mappings.

Tolerance selection must be tied to the quantity, numerical scale, conditioning, algorithm, and scientific claim. A looser tolerance must never be used merely to hide an unexplained regression.

Prefer:

- absolute tolerance near a known scale/zero;
- relative tolerance for scale-proportional quantities;
- convergence/refinement tests for sampled numerical methods;
- independently derived analytical/reference values where available.

## Rounding and quantization

Rounding is a scientific/output operation when it changes represented data.

- Keep calculations in the highest practical deterministic precision until a defined output boundary.
- Pixel/raster integer rounding rules must be explicit.
- RAW/export quantization must define scale, offset/black level, clipping, rounding/tie behavior, and code range.
- Do not round intermediate physical values for display convenience.
- Do not let serializer/container limitations redefine the authoritative scientific value.

## Signed zero and tiny values

Do not use `-0` as a semantic state.

When a public result is mathematically zero, normalize or test it according to the owning model if signed zero could leak into serialization/identity. Do not indiscriminately clamp small nonzero values to zero; that requires a documented model/tolerance decision.

## Overflow, underflow, and extreme inputs

Public functions must fail safely when arithmetic leaves the valid numerical/scientific domain.

- A finite input does not guarantee a finite computed result.
- Check derived values where overflow or invalid denominators can occur.
- Avoid transformations that turn a detectable invalid state into an apparently plausible finite number.
- Extreme-value tests should target the model boundary, not arbitrary machine limits alone.

If a stable reformulation is needed for numerical conditioning, it must preserve the documented scientific model and provenance.

## Determinism and runtime expectations

For identical validated inputs and fixed stochastic seeds, the engine should produce deterministic scientific results within the documented contract.

Do not depend on:

- object iteration order that is not part of the serialized contract;
- current wall-clock time;
- random state without an explicit seed;
- network/service responses;
- renderer/UI state;
- machine-specific hidden calibration.

Browser-safe public code and supported Node runtimes must share the same semantic result contract. If an implementation permits small runtime-dependent floating-point differences, acceptance tolerances must be explicit and scientifically harmless.

## Testing requirements

Numerical tests should use the strongest applicable form:

1. exact identity/invariant;
2. independently derived analytical constant;
3. dimensional/unit relation;
4. monotonic/bounded behavior;
5. round-trip/inverse invariant;
6. numerical convergence/refinement;
7. calibrated/reference tolerance with provenance.

The canonical `test/fixtures/basic-reference-scene.json` fixture is the preferred shared reference for cross-domain deterministic cases once available.

Do not generate the only expected value by calling the same production function under test.

## Changes to numerical behavior

A change that alters public numerical meaning must document:

- equation/model change;
- units and coordinate system;
- assumptions/applicability;
- old vs new behavior;
- tolerance/precision impact;
- API/schema/version impact;
- provenance/uncertainty consequences;
- migration implications when relevant.

A pure implementation optimization must preserve the same scientific result semantics and provenance within the existing contract.
