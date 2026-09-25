# Image-Formation Contract

Photivra's image-formation contract defines **scientific ownership, coordinate semantics, and dependency/coupling boundaries** for current and future camera effects.

It is not a claim that every stage is implemented, and it is not a requirement that renderers execute one literal serial filter chain.

Use:

```ts
import { getImageFormationContract } from "@photivra/engine";

const contract = getImageFormationContract();
```

## Five scientific domains

The contract groups image formation into five domains:

1. **scene / ray geometry**
2. **lens mapping + pupil / throughput**
3. **field- and wavelength-dependent PSF**
4. **time-dependent exposure / readout**
5. **native sensor sampling -> orientation -> output / display**

These are scientific ownership domains. Some effects couple more than one domain.

Examples:

- focus breathing changes projection/magnification and therefore couples lens mapping to scene projection;
- lateral chromatic aberration is wavelength/channel-dependent field mapping and may share wavelength basis with the PSF model;
- illumination vignetting is throughput-only;
- mechanical/pupil vignetting can change both throughput and PSF/bokeh shape;
- diffraction consumes the effective pupil and belongs to the PSF domain;
- rolling readout couples native sensor timing to temporal integration;
- camera rotation should be evaluable as a function of physical exposure time so global and rolling readout can consume the same motion model.

## Coordinate spaces

The contract explicitly distinguishes:

- `scene-metric` — scene/world metric coordinates;
- `image-plane-metric` — optical-axis origin, +X right, +Y up, millimetres;
- `native-sensor-physical` — optical-axis origin, +X right, +Y down, millimetres;
- `native-raster` — top-left origin, +X right, +Y down, pixels;
- `oriented-capture-raster` — explicit physical-orientation transform of native raster coordinates;
- `output-raster` — digital crop/resampling result;
- `display` — consumer/display coordinates, which are never authoritative camera-science coordinates.

Native sensor/raster coordinates remain invariant under physical camera orientation.

## Partial ordering and coupling

`requiredUpstreamStages` defines hard scientific dependencies.

`coupledStages` identifies interactions that must not be treated as independent post-processes.

The required-dependency graph is acyclic. Coupling may be bidirectional because it describes shared scientific state rather than execution order.

An implementation may combine stages for performance only when the combination is mathematically equivalent and the public stage/effect semantics remain intact.

## PSF contribution foundation

The `field-wavelength-psf` stage has a dedicated public foundation documented in [PSF and Pupil Foundation](PSF_FOUNDATION.md).

Current implementation:
- geometric defocus-circle diagnostic;
- ideal circular-pupil Airy first-zero diagnostic;
- explicit field/depth/wavelength/pupil context.

Reserved contributions:
- non-circular diffraction;
- mechanical pupil clipping;
- field curvature;
- field-dependent aberration;
- field-dependent bokeh.

No combined PSF is currently calculated.

## Temporal basis

Physical time is measured in **seconds from exposure start**.

A normalized `[0,1]` shutter parameter may be derived for an algorithm, but it is not the authoritative time coordinate.

Exposure duration and sensor readout timing are independent:

- global readout does not mean zero motion blur;
- rolling readout changes when different native sensor locations are sampled/integrated;
- native readout direction remains defined in native sensor coordinates even when the camera is physically rotated.

This allows later rolling-shutter work to consume the same time-parameterized camera-motion model used for global exposure.

## Renderer semantics

Renderer implementations may use a bounded real-time preview approximation or a higher-fidelity deterministic reference evaluation, but both must consume the same engine-owned scientific contract.

For geometric warps:

- destination samples are inverse-mapped to source locations;
- premultiplied-alpha semantics are preserved;
- scene depth/occlusion order is preserved across warps;
- renderer backend choice may change implementation/fidelity, not model semantics.

## Reserved sensor ordering

The contract reserves a future sensor path without claiming it is implemented:

```text
optical PSF
  -> sensor optical stack (OLPF / cover glass / microlens)
  -> photosite / CFA sampling
  -> photon / charge statistics
  -> electronic read noise / conversion
  -> ADC / quantization
  -> reconstruction (demosaic / remosaic / capture-mode combination)
  -> physical orientation transform
  -> output crop / resampling
  -> display processing
```

Temporal exposure/readout couples into the photosite/charge stages rather than acting as an unrelated display blur.

## Current implementation status

Each stage is labeled:

- `existing-foundation` — the root engine already contains the relevant foundation;
- `partial-foundation` — some low-level science exists, but the full stage contract is not implemented; spatial camera rotation in the temporal domain plus declared-scale focus breathing, radial distortion, RGB-channel lateral CA, and illumination throughput in the lens-field domain are current examples;
- `reserved-contract` — ordering/ownership is reserved for future work only.

Do not infer capabilities from a stage merely because it is present in the contract.

## Test Fixture relationship

The private Test Fixture may provide deterministic browser regression targets, but it is not the scientific source of truth for the open engine.

Engine analytical/invariant tests establish model correctness. Test Fixture images provide secondary integration and renderer evidence.

In particular:

- the LDR/sRGB optics target may verify deterministic field/channel mapping behavior;
- it does not establish spectral lens calibration, MTF, RAW/CFA truth, HDR radiometry, or real-lens performance.
