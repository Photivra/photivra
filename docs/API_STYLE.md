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

`ENGINE_API_VERSION` describes the composed engine API contract and is independent of the npm/package version.

Before 1.0, public APIs may evolve with documented changes. After 1.0, breaking public-contract changes require an appropriate major-version transition.
