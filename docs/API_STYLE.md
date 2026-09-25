# Public API Style

The open engine should feel like one coherent library.

## Rules

- Use descriptive `camelCase` function names, normally beginning with a verb such as `calculate`, `estimate`, `parse`, `validate`, or `simulate`.
- For calculations with more than one meaningful input, accept a single typed/config object rather than positional arguments.
- Include units in property names when a quantity is not represented by a dedicated unit type: `focalLengthMm`, `distanceM`, `shutterSeconds`.
- Never accept unitless ambiguous physical quantities.
- Use the same property name for the same physical concept across modules.
- Return plain serializable data from core calculations.
- Public calculation envelopes must not contain `NaN` or numeric infinities; non-finite computed results fail with `InvalidScientificResultError` rather than relying on JSON coercion.
- Keep deterministic functions synchronous. Use async only for actual asynchronous work.
- Throw typed/domain errors for invalid configurations; do not silently coerce scientifically invalid values.
- Public calculation functions and meaningful public contracts require concise JSDoc covering purpose, units, assumptions, and return meaning.
- Do not expose renderer, framework, or UI-specific types through calculation APIs.
- Public configuration interfaces that are expected to cross JSON/untrusted boundaries should have corresponding runtime parsers; TypeScript types alone are not a validation boundary.
- Runtime parsers must reject unknown enum/string values rather than falling through to a default interpretation.
- Prefer semantic role types over reusing a narrower type in the wrong stage. For example, use `RasterDimensions` for generic active/output rasters and reserve `NativeImageRaster` for the native sampling grid.
- When a physical quantity is axis-dependent, preserve the axes explicitly instead of collapsing to a scalar unless the model documents and validates that simplification.
- Preserve backward compatibility after 1.0 unless a documented major version changes the contract.

## Preferred shape

```ts
calculateFieldOfView({
  focalLengthMm,
  sensorDimensionMm,
  focusDistanceM
});

calculateDepthOfField({
  focalLengthMm,
  aperture,
  focusDistanceM,
  circleOfConfusionMm
});
```

Avoid one-off positional signatures and inconsistent abbreviations.

## Coordinate and staged-geometry contracts

Coordinate systems and image-formation stages are part of the API contract, not implementation details.

- Native raster coordinates use a top-left origin with +X right and +Y down.
- Raster rectangles use integer half-open extents.
- Physical camera rotation does not redefine native sensor coordinates; transform points, vectors, and rectangles explicitly.
- Physical active capture and later digital/output crop are distinct concepts and should have distinct fields/types.
- Off-center physical capture must preserve position relative to the optical axis rather than being silently recentered.
- Output resizing/cropping must not imply geometric stretching without an explicit transform or pixel-aspect contract.
- Conventional 35 mm-equivalent focal length is derived from active physical capture geometry; it must not replace physical focal length or silently include later digital crop.

## Image-formation ownership contracts

Cross-cutting optical/sensor effects must use the public image-formation contract rather than defining one-off stage ordering in a renderer or downstream app.

- Treat `requiredUpstreamStages` as hard scientific dependencies.
- Treat `coupledStages` as shared scientific state, not an instruction to serialize independent filters.
- Coordinate spaces are part of the public semantic contract.
- Time-dependent models use seconds from exposure start as the authoritative temporal coordinate.
- A reserved stage does not imply an implemented capability.
- Preview and reference implementations may differ in bounded fidelity but must consume the same engine-owned parameters and semantics.

## Result metadata

Primitive public scientific calculation functions return `CalculationResult<T>`, which carries model provenance and optional quality metadata.

Not every public API returns a `CalculationResult<T>`. Parsers return validated configuration values, and the composed `simulatePocCamera()` response exposes component and aggregate provenance directly because it combines many calculation results.

Optional `quality` metadata is used only when there is defensible accuracy/uncertainty information to report; deterministic analytical results should omit it rather than inventing error bars.

Quality metadata supports:

- absolute uncertainty with an explicit unit;
- relative uncertainty as a fractional magnitude;
- uncertainty source classification: measurement, model approximation, or calibration;
- optional confidence/coverage level only when its basis can be stated;
- documented model/calibration valid ranges;
- concise quality notes.

Uncertainty entries identify the affected result with a JSON-style `quantityPath` such as `value.distanceM`. Valid ranges identify the relevant parameter with a path such as `input.focusDistanceM`.

Do **not** automatically sum, average, add in quadrature, or otherwise collapse multiple uncertainty components. Combination is permitted only when the implementing model documents the mathematical method plus independence/correlation assumptions. Aggregate simulations should preserve component uncertainty or explicitly state that no combined uncertainty has been calculated.

## Versioning

Photivra has multiple independent version surfaces:

- npm/package version: distribution/release version;
- `ENGINE_API_VERSION`: root browser-safe engine/public-contract version;
- `POC_SIMULATION_API_VERSION`: composed `simulatePocCamera()` request/response contract;
- schema-specific versions such as sensor-architecture or radiometry-readiness schemas.

Do not reuse one version as a proxy for another. A change to a parser/schema does not necessarily require changing the POC contract, and a POC response change does not necessarily mean the npm package has been released.

Before 1.0, public APIs may evolve with documented changes. Breaking or semantically meaningful contract changes must update the relevant version surface, tests, changelog, and migration/compatibility documentation. After 1.0, breaking public-contract changes require an appropriate major-version transition.
