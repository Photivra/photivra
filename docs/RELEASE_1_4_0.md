# Engine 1.4.0 candidate release review

This additive candidate aligns package, lockfile, citation and root engine identity at 1.4.0. It is not tagged or published. The application's production dependency remains the published 1.2.0 package until an approved release and explicit consumer migration.

Changes include the previously merged ideal pupil support and the separate metadata-only packed native RAW, source-to-RAW, same-RAW development and bounded post-SDR Print JPEG/ICC APIs. Independent schema versions remain 0.1.0. Reference inline plane, RAW and photographic export caps remain unchanged. Shared scalar helpers preserve the existing charge/noise/ADC, reconstruction, color and SDR equations. Reference JPEG byte controls cover eighteen original encoder cases including odd padding, three quantization steps and empty metadata.

See [native contracts and reproducible evidence](NATIVE_RAW_AND_PRINT.md), [pupil contract](SENSOR_APERTURE_RAYS.md), and [recorded controls](validation/native-raw-print-2026-10-04/validation.json).

## Review boundaries

The new tasks execute complete constructed capture inputs; they do not authenticate caller-owned artifact hashes or calibrate arbitrary source callbacks. Source radiometry/visibility, quadrature convergence, device resources, production stage composition, printer appearance and platform delivery remain separate contracts. Full production depth composition remains closed. The new native event records are deliberately separate from bounded `SensorRawFrame` and cannot be inserted into it as fabricated small frames.

The public engine contains original Apache-licensed math, serialization and synthetic controls only. Private application scene sources, fixture assets and proprietary adapters are retained in the application repository. The original ICC profile uses standard format/color facts, not a redistributed profile or encoder implementation.

## Owner handoff

1. Review the exact candidate code and public source provenance, scientific domains, unit/frame/phase/seed binding, resource limits and disposal behavior. AI-assisted changes remain draft until substantive human review under AGENTS.md.
2. Require green exact-head CI on Node 22.13, 22, 24 and 26, plus the package, documentation and isolated consumer gates. The optional actual megapixel run is separately recorded; its ordinary-suite skip is explicit.
3. Approve merge and the concrete 1.4.0 release only after review. Merge must not silently publish a tag. Check final main/commit/version identity and unchanged package consumer acceptance.
4. With explicit publication approval, use the repository release procedure/workflow for GitHub and npm. Confirm the published tarball, root export, version and provenance before migrating the application. Do not treat local candidate tooling as a published production import.
5. Finish the application’s independently retained source, output, platform and human/device acceptance at the adopted published version, then approve the concrete production deployment.

No tag, publication, production activation, credential change or deployment is authorized by this document.
