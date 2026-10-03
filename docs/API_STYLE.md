# Public API Style

Release context: **package 1.2.0 candidate / root API 1.2.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

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
- Crossing between an oriented physical raster region (+Y down) and the pre-orientation optical image plane (+Y up) must use the exported coordinate bridge rather than ad-hoc axis swaps or sign changes.
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

From 1.0.1, Photivra aligns its release and root API identities:

- npm/package version: distribution/release version;
- `ENGINE_API_VERSION`: the same full version as the npm package;
- `POC_SIMULATION_API_VERSION`: composed `simulatePocCamera()` request/response contract;
- schema-specific versions such as sensor-architecture or radiometry-readiness schemas.

The release checker enforces package/root equality. Subsystem, schema and POC versions remain independent. A change to a parser/schema does not necessarily require changing the POC contract, and a POC response change does not necessarily mean the npm package has been released.

Before 1.0, public APIs may evolve with documented changes. Breaking or semantically meaningful contract changes must update the relevant version surface, tests, changelog, and migration/compatibility documentation. After 1.0, breaking public-contract changes require an appropriate major-version transition.


## Public function verb families

Use the established verb family that matches the operation's semantics. Do not invent a new synonym when one of these already fits.

- `calculate*` — deterministic scientific/numeric calculation.
- `estimate*` — explicit approximation/estimate.
- `parse*` — validate and normalize a versioned/untrusted configuration boundary.
- `validate*` — assert/check validity without changing semantic identity.
- `resolve*` — derive one deterministic semantic state from already-defined inputs/profiles.
- `assess*` — produce a compatibility/readiness/applicability assessment, including structured blockers.
- `create*` — construct a new semantic record/snapshot/manifest whose identity is part of the contract.
- `prepare*` — validate/canonicalize relatively static context for repeated later evaluation.
- `serialize*` — convert an authoritative semantic value to its documented deterministic serialized representation.
- `compose*` — combine multiple independently meaningful inputs/stages into a higher-level semantic result.
- `integrate*` / `reduce*` — mathematically aggregate explicit measures/samples under a documented model.
- `distribute*` — allocate an integrated quantity across explicitly normalized fractions while preserving its quantity domain; this does not create a continuous density from discrete spectral lines.
- `evaluate*` / `meter*` — evaluate a declared model/policy against current scene/capture data.
- `map*` / `transform*` — coordinate/domain transformation with explicit source/destination semantics.
- `bind*` — attach one already-defined result/state to another authoritative context without re-solving it.
- `set*` — return an updated immutable semantic value for a narrowly defined state-setting operation.
- `get*` — return a descriptive/static contract owned by the engine.
- `simulate*` — intentionally composed simulation/orchestration API.

Existing result factories `calculatedResult`, `estimatedResult`, `approximationResult`, and `calibratedResult` are documented core helpers rather than new public verb families.

A new verb family requires a concrete semantic distinction from the existing set and a documentation/update review.

## Input and return-shape consistency

Choose API shape from semantic role, not module history.

- Public scientific calculations with multiple inputs accept one typed input object.
- Parsers accept one value/configuration and return the validated semantic value or throw the appropriate typed/domain error.
- Compatibility/readiness assessments should return structured blockers for scientifically incomplete-but-well-formed requests instead of converting every blocker into an exception.
- Malformed schema/numeric input should fail fast with the established typed/domain error.
- Calculations normally return `CalculationResult<T>`; do not wrap parsers merely to make every function look identical.
- Immutable snapshots/plans/manifests may use their own versioned record contracts when provenance, identity, or serialization semantics require them.
- Do not create module-specific aliases for shared concepts such as evidence, uncertainty, coordinate spaces, ranges, or scientific status unless the domain meaning actually differs.

Consistency must never erase a meaningful scientific distinction.

Internal immutable-data mechanics are shared through `src/core/owned-data.ts`.
Capture, RAW attachment/reconstruction, export metadata and equipment presets use
its child-first freeze helper only on their owned plain-data trees. Each domain
keeps its own validation and copy boundary; freezing is not parsing or cloning.
Already-frozen parents still require descendant traversal in this helper. The
production planner, focus and release helpers retain their distinct early-return
behavior for already-frozen objects. This internal module is not a root export.

`src/core/canonical-json.ts` shares sorted-key finite-JSON mechanics while each
caller supplies its existing omission and error policy. Production-plan records
omit undefined object properties; capture comparison and export hashing reject
them. Array order and JSON number/string representation are preserved. Planner
FNV-1a fingerprints and export SHA-256 hashes remain separate identity contracts;
the helper neither selects a hash nor changes either contract. Capture's public
serialization keeps its existing validated JSON.stringify representation.

## Compatibility and deprecation policy

The package and root API share a release version. Update independent schema/model/POC versions only when their observable contracts change.

### Package version

The npm package version identifies a published distribution. It is not a proxy for every internal/public contract version.

### `ENGINE_API_VERSION`

Set to the npm package version for every release, including patches. New records use this creator identity; parsers preserve historical archive identities.

### Subsystem/schema versions

Versioned schemas, production-plan contracts, POC contracts, and similar surfaces own their own versions. A change to one does not automatically bump unrelated contracts.

### Before package 1.0

The project may make breaking public changes when the scientific/architectural benefit justifies them, but such a change must:

- be intentional rather than incidental;
- update the relevant API/schema/contract version;
- update tests and public documentation;
- describe migration/compatibility impact;
- avoid silently reinterpreting previously valid serialized data.

### After package 1.0

Breaking root-package public-contract changes require the normal SemVer major-version process. Independently versioned schema/contract changes still follow their own documented compatibility rules.

### Deprecation

When practical, prefer an additive migration period:

1. introduce the replacement contract;
2. document the migration;
3. keep old behavior stable long enough for deliberate downstream migration;
4. remove only through the appropriate breaking/versioned change.

Do not keep an unsafe or scientifically false API solely to avoid a breaking change. Correctness remains the higher priority, but the break must be explicit.

## Compatibility guard tests

The repository should maintain representative compatibility sentinels rather than freezing every pre-1.0 export forever.

Sentinels should cover:

- root engine and composed POC version surfaces;
- representative `calculate`, `parse`, composition, and simulation APIs;
- public function naming conventions;
- typed error/result semantics where relevant.

Adding a legitimate new API may require extending the naming test. Removing or renaming a sentinel requires explicit compatibility/version review.

## OpenSource V1 API consistency audit

The OpenSource V1 audit treats the existing engine conventions as the baseline rather than redesigning stable APIs.

The root runtime surface currently uses the documented verb families above, with the four result-factory helpers as explicit exceptions. Future OpenSource V1 work should follow these conventions at implementation time.

Audit rule:

- preserve scientifically meaningful existing differences;
- normalize accidental naming/shape drift when low risk;
- do not perform broad cosmetic refactors solely for symmetry;
- record/document any intentional exception;
- keep private-app conventions from becoming public-engine contracts by accident.

## Stable 1.0 distribution transition

Historically, package 1.0.0 retained `ENGINE_API_VERSION = "0.116.0"`: this independent root contract identity is already embedded in serialized captures and does not itself signal a published distribution. The package 1.0 policy now governs breaking changes despite that historical root ID. No schema/model/POC/plan version is reset. See [migration and release procedure](RELEASE_1_0.md).

## Aligned 1.0.1 release transition

Starting with 1.0.1, `ENGINE_API_VERSION` equals the full npm package version. Package and root API follow one SemVer release sequence; schema/model/POC/plan versions remain independent. Archived capture identities and measured artifacts are preserved. Newly created capture/plan bytes and identity hashes can change because their creator API field now records 1.0.1. See [migration and release procedure](RELEASE_1_0_1.md).
