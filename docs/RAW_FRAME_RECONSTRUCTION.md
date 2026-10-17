# Same-RAW reconstruction handoff

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

See [Reference RAW frame compatibility](RAW_FRAME_ENVELOPE.md) for the limits of each stage, how full-native sites are counted, and how parsers check input up front.

## What it does

`resolveRawFrameReconstruction()` turns a region of a committed `SensorRawFrame` into a plane of virtual-sensor channels (issue #16C). The region is a bounded, contiguous rectangle of the native sensor.

- Every output pixel is computed by the existing `resolveSensorRawReconstruction()`, using only the exact attached RAW samples.
- The capture's separate float planes are kept as history and metadata. They **never supply reconstructed values**.

**Versions.** This adapter, and the RAW attachment it builds on, are merged. Handoff schema 0.1.0 is kept; root API 0.99.0 was the version that introduced it. Package and root API 1.0.1 use one aligned release version; the capture, production and POC contracts are versioned independently.

## Inputs

The inputs are `rawFrame`, `region: { x, y, width, height }` and `phaseProfiles: [{ phaseX, phaseY, profile }]`.

- **Region.** A half-open rectangle with positive integer size, in the full native raster. It is not in crop-local or oriented output coordinates.
- **Revalidation.** The RAW frame's flags, dimensions, full native coverage, exact site/channel/code normalisation and IDs are all checked again, through the RAW attachment contract.

**Phase profiles.** The sensor's CFA (colour filter array) repeats in a small tile; each position in the tile is a phase.

- Every absolute CFA phase must have exactly one explicit reconstruction profile, matching the frame's capture-mode and colour-sampling identities.
- All phase profiles must list the same output channels, in the same order.
- Dispatch uses absolute native indices modulo the declared repeat size. A cropped region never restarts the phase pattern.
- Profiles are sorted into row-major order within the repeat tile, whatever order you supply them in.
- No Bayer or X-Trans algorithm, and no RGB colour basis, is inferred from labels.

## How each pixel is computed

1. The adapter collects exactly the sites it needs from the attached frame.
2. It checks bounds and channel assignment.
3. It calls the existing per-pixel reconstruction.

- The declared normalised kernel weights define the linear reconstruction. Negative weights are allowed by that existing contract.
- Source values are the existing signed `blackSubtractedNormalizedCode`, not raw storage codes divided by the container maximum.
- No new black subtraction, saturation, noise or gain equation, or quantisation, is added.

**Edges.** Missing edge sites fail closed (are rejected). There is no edge replication, reflection, zero fill, dropped weight or renormalisation. You can choose a smaller explicit region with complete neighbourhoods, but you must not quietly change the intended final framing.

Supplying a profile for every phase does not prove the kernel is a calibrated or adequate reconstruction algorithm.

## Result

The result includes:

- an immutable snapshot of the exact source RAW frame;
- the phase profiles;
- the region;
- the reconstructed plane, interleaved, in row-major order over the native region;
- detailed child calculation records, with the exact weighted source contributions.

The top-level scientific status stays **approximation**, even if a profile labels itself calibrated. Child status and assumptions are kept. No combined uncertainty is made up.

**Lineage.**

- `lineage = "engine-reconstructed-from-attached-raw"` means the returned values really were computed from the returned RAW snapshot.
- `producerOriginVerified = false` keeps the RAW attachment's boundary: the producer is declared by the caller, and nothing claims that a caller originally ran the sensor pipeline.
- IDs alone do not prove equality; the exact snapshot and contributions stay available to inspect.
- This is not cryptographic provenance, a signed certificate, RAW integrity metadata or a SimulationHash.

**What the plane is.** The plane's image state is `virtual-sensor-channels`, and its raster binding is `native-reconstruction-region`. It is deliberately **not** an already-oriented `CaptureLinearPlane`.

- No white balance, colour conversion, physical orientation, final crop or resampling, sharpening, denoising or JPEG pipeline is applied.
- Sensor-channel labels do not define calibrated RGB primaries.
- An explicit downstream colour-profile and geometry bridge is needed before processed output can accept these values. The capture's existing float planes must not be substituted at that point.

## Limits

Reference safety limits:

- at most **4,096 full-native RAW sites**;
- at most **64 repeat phases**;
- at most **16 output channels**;
- at most **256 total contributions per phase profile**.

The region cannot be larger than the native frame. The reference adapter keeps source snapshots and per-pixel traces, and reparses lower-level profiles. It makes no claim about performance or memory at 24, 45 or 60 MP. Larger or streaming execution needs separately reviewed work, with measurements.

## Tests

The tests reuse capture metadata derived from the canonical shared fixture (issue #130), and the shared synthetic RAW fixture. The declared 2×2 tile-average kernels are a deliberately simple regression policy, not a manufacturer's demosaic or calibrated sensor colour.

Tests independently check:

- the arithmetic;
- direct equivalence with the lower-level function;
- that changing RAW codes changes the output while changing unrelated float planes does not;
- that native phase and orientation do not affect results;
- malformed and stale inputs;
- edge rejection;
- the safety limits.

Remaining work when this was written: sensor execution bound to the producer, a defensible sensor colour interpretation and profile, the geometry handoff from reconstruction to the oriented active area and output, the colour and white-balance processing handoff, metadata, hash and format mapping, DNG and JPEG writers, and acceptance by decoders and editors and for memory. This slice closed no issue.
