# V1 internal helper reuse review

This review addresses the remaining repeated validation mechanics in defect
#178. It does not close production integration, performance, editor acceptance
or final release preparation. The review follows main `e5a6ce2` and the earlier
freeze, canonical JSON and sensor-color ownership changes. It also includes
the temporal photo-signal handoff from draft PR #192, on which this draft is
stacked for combined acceptance.

## Shared mechanics

`src/core/record-validation.ts` now owns the equivalent record/own-enumerable-key
allowlist check used by capture, RAW attachment/producer/reconstruction, export
metadata, photographic export, linear encoding, capture color and SDR/correction
boundaries, plus the temporal photo-signal boundary. It also owns the identical 1–128 character ASCII public opaque ID
grammar used by capture, RAW, exporter, producer, color, SDR and temporal photo-signal boundaries.

Domain wrappers retain their original diagnostics. Domains still own field
lists, required fields, enum choices, evidence, numerical validity, copying,
freezing and scientific contracts. The helper returns the existing record;
it does not sanitize input or silently add stricter object semantics. This
preserves the existing treatment of inherited/non-enumerable/symbol properties
and is not a general serializer or hostile JavaScript object sandbox.

## Separations retained

- Finite-number validators differ in sign, integer ranges, negative-zero policy
  and diagnostics. A single generic validator would obscure those contracts.
- Dense arrays have different limits, required lengths, sparse-array behavior
  and element validation. Their domain policies remain local.
- UUID and SHA-256 grammars remain distinct from opaque public IDs.
- Planner/focus/release freezing has intentionally different early-return
  semantics from the shared child-first owned-data freeze.
- Planner fingerprints and export hashes share canonical JSON mechanics, but
  retain different undefined-value policies and identity algorithms.
- Sensor-color development and ideal virtual-camera transforms retain their
  separate basis, conditioning and physical meanings.
- Evidence/calibration parsers retain their own model/version/applicability
  checks. A public identifier grammar is not scientific applicability evidence.

The equivalent helper findings are addressed by the shared implementation and
these explicit retained boundaries. Future reuse should follow demonstrated
semantic equivalence, rather than mechanical similarity alone.

## Compatibility and verification

No public export, version, schema, equation, seed schedule or byte-identity
algorithm changes. Existing historical capture/RAW/DNG/JPEG hash regressions
remain the exact-byte oracle. Public-boundary tests cover invalid record shapes,
unknown fields and unsafe identities with unchanged domain error messages.
The shared helpers stay internal to the package's root export contract.

The final #180 audit must revisit this assessment against the integrated release
candidate; this document is not that exhaustive final documentation audit.
