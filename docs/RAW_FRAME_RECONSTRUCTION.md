# Same-RAW reconstruction handoff (#16C)

Release context: **package 1.0.0 candidate / root API 0.116.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0.md).

See [Reference RAW frame compatibility](RAW_FRAME_ENVELOPE.md) for stage-specific
limits, full-native counting and parser preflight behavior.

`resolveRawFrameReconstruction()` derives a bounded contiguous native-region virtual-sensor-channel plane from a committed `SensorRawFrame`. It delegates every output pixel to the existing #14 `resolveSensorRawReconstruction()`, using only exact attached RAW samples. Independent float planes in the attached capture are retained as history/metadata and **never provide reconstructed values**.

This adapter and its RAW attachment predecessor are merged. Handoff schema 0.1.0 is retained; root API 0.99.0 was its historical introduction identity. Package 1.0.0 retains current root 0.116.0 and independent capture/production/POC contracts.

Inputs are `rawFrame`, `region: { x, y, width, height }`, and `phaseProfiles: [{ phaseX, phaseY, profile }]`. A region is a positive integer half-open rectangle in the full native raster, not crop-local or oriented output coordinates. RAW-frame flags, dimensions, full native coverage, exact site/channel/code normalization and IDs are revalidated through #166.

Every absolute CFA repeat phase must have exactly one explicit #14 reconstruction profile, matching the frame's capture-mode and color-sampling identities. All phase profiles expose the same output channels in the same order. Dispatch uses absolute native indices modulo the declared repeat dimensions; a cropped region never restarts phase. Input profile order is canonicalized to repeat-tile row-major phase order. No Bayer/X-Trans algorithm or RGB color basis is inferred from labels.

For each pixel, the adapter gathers the exact required sites from the attached frame and checks bounds/channel assignment before calling #14. Existing declared normalized kernel weights own linear reconstruction; negative weights are permitted by that existing contract. Source values are the existing signed `blackSubtractedNormalizedCode`, not raw storage codes divided by container maximum. No new black subtraction, saturation/noise/gain equation or quantization is introduced.

Missing edge sites fail closed. There is no edge replication, reflection, zero fill, dropped weight or renormalization. A caller may choose a smaller explicit region with fully available neighborhoods, but must not silently change intended final framing. Supplying a profile for every phase is not proof the kernel represents a calibrated or adequate reconstruction algorithm.

The result includes an immutable exact source RAW-frame snapshot, phase profiles, region, interleaved native-region row-major plane and child calculation envelopes with exact weighted source contributions. The top-level scientific status remains **approximation** even if a profile labels itself calibrated; child status and assumptions are retained. No aggregate uncertainty is fabricated.

`lineage = "engine-reconstructed-from-attached-raw"` means these returned values were actually computed from that returned RAW snapshot. `producerOriginVerified = false` retains #166's caller-declared producer boundary: no assertion is made that a caller originally ran the sensor pipeline. IDs alone do not establish equality; the exact snapshot and contributions remain inspectable. This is not cryptographic provenance, a signed certificate, RAW integrity metadata or a SimulationHash.

The plane's image state is `virtual-sensor-channels`, and its raster binding is `native-reconstruction-region`; it is deliberately **not** an already-oriented `CaptureLinearPlane`. No WB, color conversion, physical orientation, final crop/resampling, sharpening, denoising or JPEG pipeline is applied. Sensor-channel labels do not define calibrated RGB primaries. A downstream explicit color-profile and geometry bridge is required before #112/#164 can accept these values. Existing capture float planes must not be substituted at that boundary.

Reference safety limits: at most **4,096 full-native RAW sites**, **64 repeat phases**, **16 output channels**, and **256 total contributions per phase profile**. Region size cannot exceed that native frame. The reference adapter retains source snapshots and per-pixel traces and reparses lower-level profiles; it is not a 24/45/60 MP performance or memory claim. Larger/streaming execution requires measured separately reviewed work.

Tests reuse #130-derived capture metadata and the shared synthetic RAW fixture. Declared 2×2 tile-average kernels are intentionally simple regression policy, not manufacturer demosaic or calibrated sensor color. Tests independently check arithmetic, direct lower-level equivalence, RAW-code changes versus unrelated float-plane changes, native phase/orientation invariance, malformed/stale inputs, edge rejection and safety bounds.

Remaining #16/#112 work: producer-bound sensor execution, a defensible sensor color interpretation/profile, reconstruction-to-oriented-active/output geometry and color/WB processing handoff, metadata/hash/format mapping, DNG/JPEG writers and decoded/editor/memory acceptance. No issue is closed by this slice.
