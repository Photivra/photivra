# Photivra

Photivra is an open TypeScript engine for the science and mathematics of photography and digital imaging.

**Pronunciation (IPA):** /foʊˈtɪvɹə/

Photivra provides a reusable, tested API for camera geometry, optics, focus and depth of field, exposure, subject and camera motion, sensor sampling, diffraction, cropping and framing, stabilization approximations, and signal/noise calculations.

Its calculations use explicit units, documented assumptions, validation, provenance, and clearly labeled approximations so results are reproducible and their limitations are understandable.

The source is licensed under Apache-2.0.

Standalone stray-light irradiance, composed digital geometry and generic camera lens-correction APIs are documented in [Digital optics foundations](https://github.com/Photivra/photivra/blob/main/docs/DIGITAL_OPTICS_FOUNDATION.md). They preserve optical/sensor capture authority and explicit sampling/noise costs; production composition remains separate.
The standalone [SimulatedCapture contract](https://github.com/Photivra/photivra/blob/main/docs/SIMULATED_CAPTURE.md) commits format-neutral linear float master data and public metadata. Its [virtual-camera color model](https://github.com/Photivra/photivra/blob/main/docs/CAPTURE_COLOR.md) provides explicit linear color conversion and resolved-WB application; [linear encoding](https://github.com/Photivra/photivra/blob/main/docs/LINEAR_CAPTURE_ENCODING.md) defines deterministic 16-bit quantization. File serialization remains a subsequent stage.

The standalone [SDR rendering foundation](https://github.com/Photivra/photivra/blob/main/docs/SDR_RENDERING.md) separates post-capture rendering, output encoding and external display adaptation. Capture/WB/correction integration is available through the [processed output contract](https://github.com/Photivra/photivra/blob/main/docs/PROCESSED_OUTPUT.md), with explicit input domains and bounded support.

The standalone [Print planner](https://github.com/Photivra/photivra/blob/main/docs/PRINT_PLANNING.md) derives native-only printer-file geometry from physical image size, independent viewing distance and explicit sampling conventions. Captured detail and print quality remain unassessed.

## Quick start

After owner publication, install the ESM package below. During candidate review, use the verified tarball from the [release guide](https://github.com/Photivra/photivra/blob/main/docs/RELEASE_1_1_0.md):

```sh
npm install @photivra/engine@1.1.0
```

Calculate horizontal field of view for a 36 mm sensor dimension and 50 mm focal length:

```ts
import { calculateFieldOfView } from "@photivra/engine";

const horizontal = calculateFieldOfView({
  focalLengthMm: 50,
  sensorDimensionMm: 36
});

console.log(horizontal.value.degrees);
console.log(horizontal.provenance);
```

Start with the [Developer Guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md), then use the [Usage Guide](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md) and [export-derived API reference](https://github.com/Photivra/photivra/blob/main/docs/API_REFERENCE.md). These documents describe the unpublished 1.1.0 candidate; use the published 1.0.1 baseline until owner publication.

## Documentation

- [Usage Guide](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md)
- [Architecture](https://github.com/Photivra/photivra/blob/main/docs/ARCHITECTURE.md)
- [Contributor Guide](https://github.com/Photivra/photivra/blob/main/CONTRIBUTING.md)
- [Agent Instructions](https://github.com/Photivra/photivra/blob/main/AGENTS.md)
- [Changelog](https://github.com/Photivra/photivra/blob/main/CHANGELOG.md)
- [Public API Style](https://github.com/Photivra/photivra/blob/main/docs/API_STYLE.md)
- [Physics Foundation](https://github.com/Photivra/photivra/blob/main/docs/PHYSICS_FOUNDATION.md)
- [Image-Formation Contract](https://github.com/Photivra/photivra/blob/main/docs/IMAGE_FORMATION.md)
- [Production Image-Formation Plan](https://github.com/Photivra/photivra/blob/main/docs/PRODUCTION_COMPOSITION.md)
- [Scene Radiance and Illumination](https://github.com/Photivra/photivra/blob/main/docs/SCENE_RADIANCE_AND_ILLUMINATION.md)
- [PSF and Pupil Foundation](https://github.com/Photivra/photivra/blob/main/docs/PSF_FOUNDATION.md)
- [Motion and Signal Foundation](https://github.com/Photivra/photivra/blob/main/docs/MOTION_AND_SIGNAL.md)
- [Camera Shake and Stabilization](https://github.com/Photivra/photivra/blob/main/docs/STABILIZATION.md)
- [Scientific and Source Provenance](https://github.com/Photivra/photivra/blob/main/docs/PROVENANCE.md)
- [Scientific Assurance and Uncertainty Composition](https://github.com/Photivra/photivra/blob/main/docs/SCIENTIFIC_ASSURANCE.md)
- [Local POC HTTP API](https://github.com/Photivra/photivra/blob/main/docs/POC_API.md)

## Getting help

Use [GitHub Issues](https://github.com/photivra/photivra/issues) for reproducible bugs, documentation problems, and feature discussions. For security vulnerabilities, follow [SECURITY.md](https://github.com/Photivra/photivra/blob/main/SECURITY.md).

## What is implemented

The root package exports deterministic or explicitly labeled approximate models across four areas.

### Optics and geometry

- [generic MF / single-AF / continuous-AF focus control](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#focus-control-mf-single-af-continuous-af-and-lock), with explicit acquisition/loss/lock state, renderer-neutral longitudinal target distance, strict target-loss/reacquisition semantics, and a separate focus-vs-release priority gate;
- [explicit finite/infinity focus-plane state](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#explicit-finite-and-infinity-focus-state), without non-finite or fabricated focus distances;
- [centered and asymmetric rectilinear field of view, with optional focus-aware thin-lens projection](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#field-of-view);
- [physical vs diagonal-based 35 mm-equivalent focal length](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#actual-and-35-mm-equivalent-focal-length);
- [caller-declared focus-breathing projection/FOV approximation](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#focus-breathing-projection);
- [generic invertible radial distortion mapping](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#radial-lens-distortion-mapping), including multi-point inverse batch sampling;
- [generic RGB-channel lateral chromatic-aberration field mapping](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#lateral-chromatic-aberration-mapping);
- [generic linear-light illumination-vignetting approximation](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#illumination-vignetting);
- [front-of-lens filter transmission](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#front-of-lens-filter-transmission) for generic neutral-linear, neutral optical-density, and wavelength-resolved passive filters without polarization claims;
- [scene-radiance to sensor-irradiance optical bridge](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#scene-radiance-to-sensor-irradiance), composing explicit pupil acceptance, lens transmission or working-T-stop approximation, optional front-filter transmission, and exactly one field-throughput term while stopping before the sensor optical stack;
- [Gaussian thin-lens image distance and magnification](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#thin-lens-image-distance-and-magnification);
- [geometric depth of field and defocus-circle diameter](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#depth-of-field-and-defocus);
- [ideal circular-aperture first-zero Airy diameter](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#circular-aperture-diffraction);
- [real-lens sampled PSF and complex-pupil framework](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#real-lens-psf-profiles-and-complex-pupil-reference), with full-2D directional kernels, bounded field/focus/aperture/wavelength/defocus interpolation, explicit field-curvature/longitudinal-focus offsets, unit-energy PSF shape, separate pupil throughput, and an MTF-only fail-closed boundary;
- [separated PSF/pupil contribution foundation](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#psf-and-pupil-foundation);
- [ideal regular-polygon aperture geometry and sunstar direction symmetry](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#aperture-geometry-and-sunstar-directions).

### Exposure and motion

- [scene-to-sensor irradiance quadrature](https://github.com/Photivra/photivra/blob/main/docs/SCENE_SENSOR_QUADRATURE.md), binding declared spectral scene samples to exact pre-AA coordinates, wavelengths and time through the existing optical bridge;
- [temporal scene-to-sensor EQE composition](https://github.com/Photivra/photivra/blob/main/docs/SCENE_SENSOR_TEMPORAL_EXPOSURE.md), applying optics and response validity independently at every local shutter midpoint;
- [local sampled-PSF sensor quadrature](https://github.com/Photivra/photivra/blob/main/docs/SENSOR_PSF_QUADRATURE.md), applying wavelength-resolved normalized PSF shape with explicit native/image axes and complete source support;
- [sensor-to-environment projection queries](https://github.com/Photivra/photivra/blob/main/docs/SENSOR_ENVIRONMENT_QUERY.md), deriving scene request directions from physical optical support and analytic camera rotation;
- [executed environment capture to native RAW](https://github.com/Photivra/photivra/blob/main/docs/ENVIRONMENT_RAW_CAPTURE.md), joining provider calls, optional local PSF, temporal EQE and existing seeded RAW generation with paired export handoff;
- [temporal EQE photo signal to RAW](https://github.com/Photivra/photivra/blob/main/docs/TEMPORAL_PHOTO_RAW.md), carrying validated changing-light midpoint counts through exact-event dark/accumulated charge, native RAW and paired files;
- [irradiance-to-EQE local exposure composition](https://github.com/Photivra/photivra/blob/main/docs/SENSOR_EQE_LOCAL_EXPOSURE.md), validating explicit physical node samples through response applicability/range and stationary local integration before the existing RAW producer;
- [generic equipment exposure capabilities](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#generic-equipment-exposure-capabilities), separating generic body/lens capability facts from selected camera state and resolving focal-length-specific aperture plus shutter/ISO envelopes for downstream #99 control policy;
- [detailed ISO/exposure-index capabilities](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#isoexposure-index-capabilities-and-generic-high-iso-signal-chain), representing standard and expanded settings, Auto ISO bounds, and optional capture-mode restrictions without inferring physical gain/noise behavior;
- [generic ISO/high-ISO signal-chain profiles](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#isoexposure-index-capabilities-and-generic-high-iso-signal-chain), mapping explicit ISO/capture-mode states to #14 readout regimes while preserving upstream photons/shot noise and keeping Good/Better/Best as convenience profile selectors rather than real-camera rankings;
- [Manual and Manual + Auto ISO exposure resolution](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#manual-and-auto-iso-exposure-resolution), consuming the typed meter target and resolved equipment envelope while preserving manual aperture/shutter ownership and reporting ISO quantization/limit residuals explicitly;
- [Aperture Priority with manual ISO](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#aperture-priority-with-manual-iso), preserving caller-selected aperture/ISO while resolving only shutter against the same typed target/reference/capability contracts;
- [priority modes with Auto ISO](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#priority-modes-with-auto-iso), adding explicit minimum-shutter and aperture-first two-auto-axis policies plus Shutter Priority with manual/automatic ISO without inventing new exposure equations;
- [Program Auto and Full Auto exposure](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#program-auto-and-full-auto-exposure), using versioned generic program lines to choose aperture/shutter while keeping ISO policy explicit and limiting Full Auto to exposure axes only;
- [Bulb, Time, and long-exposure control](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#bulb-time-and-long-exposure-control), resolving control events to concrete elapsed seconds before the existing exposure-window/charge pipeline without inventing a special long-exposure physics path;
- [EV100, relative optical exposure, relative rendered exposure, and equivalent ISO compensation](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#exposure-and-iso-relations);
- [relative pre-exposure metering](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#relative-pre-exposure-metering), with explicit generic multi-zone, center-weighted, spot, and highlight-weighted policies over the oriented active capture frame, plus generic body metering capability/profile compatibility and a frozen target seam into automatic exposure;
- [scene-radiance-derived and explicit temporal metering](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#scene-radiance-derived-and-temporal-metering), binding relative meter samples to the #85 provider/material/illumination context and requiring declared time averaging for time-varying illumination without inventing a spectral-to-luminance conversion;
- [manual ordinary flash + front/rear sync](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#manual-flash-and-ordinary-sync), registering a spatial #85 scene-light source and explicit pulse waveform to #12 exposure-window timing, preserving ambient temporal illumination, and failing closed when an ordinary pulse cannot fit a real whole-frame-open interval; HSS/TTL are not faked;
- [stable meter targets and exposure compensation](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#meter-target-and-exposure-compensation), freezing metering identity for AE lock and shifting the automatic-exposure target downstream without mutating the underlying meter result;
- [deterministic logical release sequencing](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#logical-release-sequences) for single, burst, self-timer and exposure/focus bracket timing;
- [extended-object time-varying projection](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#extended-object-time-varying-projection), projecting explicit metric object points under shared rigid translation, optionally validating fronto-parallel magnification, and binding the same geometry to #12 local exposure windows without claiming visibility or a finished blur kernel;
- [constant-velocity projected point motion](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#projected-subject-motion);
- [time-parameterized spatial camera-rotation mapping](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#spatial-camera-rotation-mapping) for yaw/pitch/roll;
- [capture-local pure-rotation exposure trajectories](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#capture-rotation-exposure-trajectories), evaluated at each native point's local exposure start/end without claiming a finished rolling-shutter warp;
- [capture-mode-bound shutter/readout timing](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#capture-mode-bound-shutterreadout-timing), binding timing evidence to one exact capture-mode/profile identity while keeping sensor readout separate from exposure boundaries and failing closed on unsupported non-uniform schedules;
- [depth-aware capture translation/parallax temporal geometry](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#depth-aware-translationparallax-temporal-geometry), requiring metric scene depth, preserving camera and subject translation independently, and explicitly prohibiting one global 3D-scene translation homography;
- [temporal scene-radiance sampling](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#temporal-scene-radiance-sampling), generating deterministic provider-evaluation nodes on each point's authoritative local exposure clock and reducing only identity/time-matched radiance results;
- [capture-local pure-rotation temporal quadrature](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#capture-rotation-temporal-quadrature), using deterministic midpoint nodes plus separate normalized-average and seconds-valued temporal measures without calculating radiance or blur;
- [instantaneous inverse capture-scan mapping under pure rotation](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#instantaneous-capture-rotation-inverse-mapping), with an explicit local-exposure phase and analytic destination-to-reference ray inversion;
- [time-domain physical stabilization system](https://github.com/Photivra/photivra/blob/main/docs/STABILIZATION.md#time-domain-physical-stabilization-system), with generic synthetic sensor-shift/OIS/coordinated rotational correction, explicit latency/gain/limits, declared panning-axis bypass, and #12 local-exposure sampling without consuming tripod/support state or stop ratings;
- [the existing controlled yaw/pitch camera-shake and stabilization-equivalent approximation](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#camera-shake-and-stabilization-equivalent-approximation).

### Color controls

- [white-balance control and Auto WB](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#white-balance-and-auto-wb), including generic profile-owned presets, manual gains, independent CCT+tint intent, custom measurement, deterministic AWB priorities, and AWB lock without modifying scene illumination or RAW-like capture.

### Sensor and output

- [projected fronto-parallel object size and sensor-pixel sampling](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#projected-object-size-and-sensor-sampling);
- [pixel pitch](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#pixel-pitch);
- [sensor imaging-area, native-raster, crop-factor, megapixel, and 2D sampling metrics](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-imaging-area-and-native-raster);
- [provenance-aware sensor architecture/capability metadata](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-architecture-metadata), including independent optional CMOS/CCD technology-family identity;
- [exact color-sampling topology profiles](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#color-sampling-topology), supporting monochrome and arbitrary periodic mosaics on a sensor-anchored abstract sampling-site lattice while keeping spectral response and raster/photodiode binding separate;
- [capture-mode/color-sampling structural bindings](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#capture-modecolor-sampling-binding), explicitly relating one exact native effective raster to the color-site lattice and resolving compact pre-reconstruction source regions without inventing signal weights;
- [sensor optical-stack profiles](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-optical-stack), separating physical stack-component metadata from effective AA spatial response, with explicit absent/unknown/unresolved distinctions and arbitrary normalized point-splitting kernels;
- [sensor sampling-aperture profiles](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-sampling-aperture), explicitly registering color-site centers in native sensor physical space and resolving geometric sensitive rectangles without conflating pitch, fill area, QE, microlenses, or radiometry;
- [sensor spatial-sampling quadrature](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-spatial-sampling-quadrature), combining AA point splitting with geometric aperture integration into deterministic native-physical source nodes and weights;
- [sensor spatial-sample reduction](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-spatial-sample-reduction), reducing explicitly identified nonnegative linear node values in relative or physical irradiance domains without claiming CFA spectral filtering or RAW conversion;
- [sensor spectral-response profiles](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-spectral-response), binding reusable wavelength-dependent channel response data to exact color-sampling IDs without inferring spectra from CFA labels;
- [sensor spectral quadrature](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-spectral-quadrature), creating response-knot-aware, bounded-midpoint wavelength plans with explicit dλ while keeping response application and source-spectrum integration separate;
- [sensor spatio-spectral irradiance reduction](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-spatio-spectral-irradiance-reduction), composing explicit W/m^2/nm source samples over spatial and wavelength quadrature into pre-response irradiance/incident-flux integrals;
- [sensor-response application compatibility](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-response-application-compatibility), fail-closed matching of response plane, area normalization, spatial separability, profile identity, and reference conditions before any QE/A/W conversion;
- [sensor-response operating-range assessment](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-response-operating-range), preserving calibrated power/irradiance domain, wavelength applicability, reference conditions, and nonlinearity criterion before any instantaneous response-rate conversion;
- [photon-energy wavelength basis](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#photon-energy-wavelength-basis), deriving photon energy from vacuum wavelength with exact SI constants and requiring explicit refractive-index/atmosphere handling for air wavelengths;
- [EQE electron-rate conversion](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#eqe-electron-rate-conversion), applying authorized effective QE per wavelength node to convert geometric-aperture spectral power into incident-photon and expected-electron rates without exposure integration;
- [A/W responsivity photocurrent conversion](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#aw-responsivity-photocurrent-conversion), applying calibrated spectral responsivity per wavelength node to produce detector-terminal photocurrent magnitude under explicit electrical operating conditions without transimpedance or temporal integration;
- [dark-current charge accumulation](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#dark-current-charge), integrating evidence-backed pre-compensation thermal electron rate over the exact local EQE exposure without inventing a universal temperature law or full-well assessment;
- [accumulated-charge completeness](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#accumulated-charge-completeness), binding photo, dark, and explicitly incremental other stored-electron contributors to one exact exposure before physical full-well assessment can be authorized;
- [physical charge-capacity assessment](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#physical-charge-capacity), comparing complete expected stored electrons with an evidence-backed physical storage capacity without conflating it with camera/digital saturation or inventing blooming/clamping;
- [stochastic sensor charge and RAW-code readout](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#stochastic-charge-conversion-adc-and-raw-code), with deterministic seeded photo/dark shot-noise, explicit additional-charge sampling policies, separate electronic read-noise components, explicit conversion-gain regimes, black offset, pre-ADC saturation, ADC quantization, and digital saturation without inferring behavior from ISO;
- [capture-mode/CFA-bound RAW samples and reconstruction](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#raw-capture-samples-and-reconstruction), preserving absolute native CFA phase, failing closed for grouped/remosaic modes without explicit combination math, and using evidence-backed capture-mode/CFA-specific linear reconstruction kernels without claiming aliasing or moiré modeling;
- [camera saturation-capacity assessment](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#camera-saturation-capacity), comparing dark-corrected photo-signal electron-equivalent expectation against an evidence-backed camera response-chain saturation capacity without reusing total stored charge or inferring the limiting clipping stage;
- [local sensor-rate/exposure binding](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#local-sensor-rateexposure-binding), mapping an exact response-rate color site through an evidenced one-to-one native-effective-raster relationship to its local shutter window without yet authorizing rate×duration integration;
- [constant-rate local-exposure integration](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#constant-rate-local-exposure-integration), requiring stationarity evidence for the exact local window before producing EQE expected counts or A/W photocurrent charge while keeping saturation unauthorized;
- [processed camera output](https://github.com/Photivra/photivra/blob/main/docs/PROCESSED_OUTPUT.md), sharing explicit RAW-derived SDR development between preview, paired JPEG and committed production-plan output stages;
- [orthogonal capture-mode profiles](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#capture-mode-profiles), separating acquisition sequence, per-frame sampling, sensor-shift sequence, reconstruction stages, processed raster, and final output geometry;
- [capture-specific native sensor readout scan timing](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#sensor-readout-timing), with separately evidenced total data-readout duration and rolling spatial timing skew;
- [readout/exposure spatial linkage assessment](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#readoutexposure-spatial-linkage), for evidence-backed same/reversed normalized phase relationships between rolling readout and electronic exposure boundaries without asserting absolute synchronization;
- [capture exposure-window timing](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#capture-exposure-window-timing), with independent opening/closing boundary schedules and local-duration validation;
- [capture orientation, active sensor area, and output geometry](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#capture-orientation-active-area-and-output-geometry);
- explicit oriented-physical-raster ↔ pre-orientation image-plane metric coordinate transforms for renderer/lens-field integration;
- [centered crop and subject-height framing crop](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#centered-crop-and-subject-framing-crop);
- [radiometry prerequisite/readiness assessment](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#radiometry-readiness);
- [mean photoelectron conversion and basic shot-noise/read-noise SNR primitives](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#photoelectron-and-snr-primitives).

### Data, validation, and composition

- [shared spectral wavelength primitives and scene illumination-source profiles](https://github.com/Photivra/photivra/blob/main/docs/SCENE_RADIANCE_AND_ILLUMINATION.md), keeping source metadata distinct from outgoing scene radiance while preserving explicit source-specific units, approximation/calibration status, provenance, and renderer-independent source identities;
- [scene material-response and radiance-provider contracts](https://github.com/Photivra/photivra/blob/main/docs/SCENE_RADIANCE_AND_ILLUMINATION.md#scene-radiance-provider-and-material-response-boundary), validating renderer/provider fidelity, exact scene/profile/sample binding, wavelength/time/direction identity, and W/m²/sr/nm output without treating provider output as calibrated sensor input;
- [shared continuous spectral coverage and discrete-line composition](https://github.com/Photivra/photivra/blob/main/docs/SCENE_RADIANCE_AND_ILLUMINATION.md#shared-spectral-composition), intersecting explicit scene/optics/sensor wavelength support and preserving delta-like integrated line measures separately from continuous per-nanometre quadrature;
- [temporal illumination waveforms and capture-time registration](https://github.com/Photivra/photivra/blob/main/docs/SCENE_RADIANCE_AND_ILLUMINATION.md#temporal-illumination), evaluating flash/flicker relative multipliers in seconds against authoritative local exposure windows without conflating sensor readout, metering, or automatic exposure policy;
- [image-formation ownership/order contract](https://github.com/Photivra/photivra/blob/main/docs/IMAGE_FORMATION.md), including coordinate, temporal, renderer, and reserved sensor-stage semantics;
- [production image-formation plan](https://github.com/Photivra/photivra/blob/main/docs/PRODUCTION_COMPOSITION.md), separating prepared static context from immutable capture snapshots, binding committed #105 release-frame and #108 WB state, expanding stage dependencies from the authoritative graph, composing the #110 physical path plus mature temporal timing/rotation foundations, preserving cross-engine scientific assurance/evidence/uncertainty, surfacing renderer/engine fidelity blockers, and providing shared optimized/reference consumer manifests without modifying the POC;
- [camera/scene schemas and runtime validation](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#camera-and-scene-schema-validation);
- [provenance plus optional uncertainty/quality metadata](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#provenance-uncertainty-and-quality-metadata);
- [the composed `simulatePocCamera()` proof-of-concept calculation](https://github.com/Photivra/photivra/blob/main/docs/USAGE.md#composed-poc-simulation).

The package has no runtime npm dependencies.

## Sensor/capture integration status

The sensor/capture foundations are intentionally **additive**.

The root engine now exposes standalone APIs for:

- physical sensor imaging area and native raster metrics;
- independent X/Y geometric sampling pitch;
- active-capture rectangles and physical camera orientation;
- native↔oriented point/vector/rectangle transforms;
- off-center/asymmetric active-capture FOV;
- diagonal-based 35 mm-equivalent focal length;
- evidence-backed sensor architecture metadata;
- evidence-backed color-sampling topology profiles for monochrome, arbitrary periodic mosaics, and structural-only layered color declarations;
- evidence-backed native-effective-raster ↔ color-site-grid bindings plus capture-mode structural-source resolution with explicit grouped-mode phase and channel-site counts;
- evidence-backed sensor optical-stack profiles with ordered physical components, microlens presence metadata, and separately declared effective anti-aliasing spatial response;
- evidence-backed sensor site-center registration plus geometric sampling-aperture profiles with unresolved/resolved footprint semantics and derived geometric sensitive-area fraction;
- evidence-backed sensor spectral-response profiles plus deterministic bounded spectral-quadrature plans that preserve wavelength measure separately from response application and source-spectrum integration;
- evidence-backed capture-mode profiles with single/fixed/variable multi-frame acquisition, native/grouped/declared per-frame sampling, optional sensor-shift offsets, reconstruction stages, and processed-image raster separation;
- capture-specific native readout scan timing with explicit provenance and no output-resolution inference;
- capture exposure-window timing with independent opening/closing boundary schedules;
- capture-local stationary-ray rotation trajectories driven by exposure windows, with sensor readout intentionally excluded;
- instantaneous inverse capture-scan rotation mapping at a caller-selected local-exposure phase, still independent from sensor data-readout timing;
- radiometry prerequisite/readiness assessment.

These contracts are **not all composed into `simulatePocCamera()` yet**. POC API 0.20 now composes staged capture geometry through final output/viewing semantics: orientation, active-capture rectangles, output crop/raster, active/output FOV, active-capture 35 mm-equivalent focal length, viewing-based CoC against the final retained physical area, orientation-aware subject framing, and explicit output pixel scaling. Sensor-architecture metadata, color-sampling topology profiles, native-effective-raster/color-site bindings, sensor optical-stack profiles, sensor sampling-aperture profiles, capture-mode profiles, sensor readout scan timing, capture exposure-window timing, and radiometry-readiness profiles remain uncomposed into the legacy POC. The separate production plan 0.7.0 executes its bounded declared environment/sensor/RAW/output route. Readout timing stays in invariant native sensor coordinates; physical orientation is an explicit downstream transform.

The POC exposes X/Y sampling diagnostics but still uses one representative horizontal pitch internally for several pixel-domain calculations; it therefore rejects geometry whose X/Y pitch differs by more than 1% rather than silently producing directional error.

Likewise, radiometry readiness does not enable photon/noise output in the POC. Integration of these foundations is separate future work and should happen explicitly rather than by silently changing existing request semantics.

## Sample use case

A developer wants to model how a change in camera settings affects an image.

Using Photivra, the application can provide camera and scene parameters—such as sensor dimensions, focal length, aperture, shutter speed, focus distance, subject distance, and motion—and receive structured scientific results describing effects such as:

- field of view;
- projected subject size;
- depth of field and defocus;
- diffraction;
- subject-motion blur;
- camera-shake blur;
- pixel sampling;
- crop and framing;
- exposure relationships;
- basic signal and noise behavior.

Each result includes explicit units and model provenance, with approximations clearly identified rather than presented as exact physical measurements.

```ts
import {
  calculateFieldOfView,
  calculateDepthOfField,
  calculateProjectedMotionBlur
} from "@photivra/engine";

const fieldOfView = calculateFieldOfView({
  focalLengthMm: 200,
  sensorDimensionMm: 36,
  focusDistanceM: 22
});

const depthOfField = calculateDepthOfField({
  focalLengthMm: 200,
  aperture: 5.6,
  focusDistanceM: 22,
  circleOfConfusionMm: 0.03
});

const motion = calculateProjectedMotionBlur({
  focalLengthMm: 200,
  shutterSeconds: 1 / 1000,
  positionM: { x: 0, y: 1, z: 22 },
  velocityMps: { x: 10, y: 0, z: 0 },
  focusDistanceM: 22,
  pixelPitchMicrometers: 6
});

console.log(fieldOfView.value);
console.log(depthOfField.value);
console.log(motion.value);
```

The calling application can then use those results while keeping the underlying photography calculations centralized, tested, and reproducible.

## Status

- Repository package version: `1.1.0` (release candidate; publication is separate)
- Engine API contract: `1.1.0`
- Versioned generic tier reference assets: [GENERIC_TIER_PRESETS.md](https://github.com/Photivra/photivra/blob/main/docs/GENERIC_TIER_PRESETS.md).
- Composed POC simulation API contract: `0.20.0`
- Stability: 1.0 root-package compatibility policy; bounded scientific models and independent POC contract

From 1.0.1, package version and `ENGINE_API_VERSION` are equal. New captures/plans record 1.1.0; existing archives retain their original creator identities. Schema, model and POC contract versions remain independent. Breaking root contracts now require a package major release; additive and corrective changes follow [compatibility and migration](https://github.com/Photivra/photivra/blob/main/docs/RELEASE_1_1_0.md). A 1.0 package is not a claim of calibrated physical accuracy.

Creating a GitHub release/tag and publishing `@photivra/engine` are separate release actions. The tag-triggered publish workflow verifies that the `vX.Y.Z` tag matches the package version before publishing.

## Image-formation integration boundary

The root engine now exports `getImageFormationContract()` as a descriptive public contract for scientific domain ownership, coordinate spaces, stage dependencies/couplings, temporal basis, renderer warp/compositing semantics, and reserved sensor ordering.

The contract does **not** claim that every listed stage is implemented. Reserved stages remain future work, and `simulatePocCamera()` is unchanged at API 0.20. See [Image-Formation Contract](https://github.com/Photivra/photivra/blob/main/docs/IMAGE_FORMATION.md).

## Important scientific limits

Photivra deliberately avoids claiming more than the current models support.

- Focus-aware projection is ideal paraxial thin-lens geometry by default. A separate declared-scale focus-breathing approximation can alter projection/framing for one focus state, but Photivra does not infer a breathing curve or claim named-lens calibration.
- Generic radial distortion is a caller-parameterized field mapping with an explicit physical normalization radius and invertible operating envelope. Decentering/tangential distortion and named-lens calibration are not yet modeled.
- Generic illumination vignetting is a field-dependent scene-linear/channel-linear attenuation model only; it does not model pupil clipping, cat's-eye bokeh, PSF changes, or calibrated lens radiometry.
- Generic lateral CA is represented as independent radial field mapping for abstract RGB renderer channels. It is not a spectral lens model, sensor-CFA calibration, longitudinal-CA model, or named-lens profile.
- The legacy projected-motion primitive follows one representative point. Separate extended-object/depth-direction temporal projection supports declared rigid reference geometry and constant linear motion; visibility, deformation and radiance accumulation remain external responsibilities.
- The legacy stabilization-equivalent camera-shake API remains one global yaw/pitch image-plane vector. A separate low-level rotation-only mapping now models field-position-dependent yaw/pitch/roll image motion; separate depth-aware translation/parallax quadrature and generic response/latency/limit stabilization models are available. Neither models calibrated commercial IBIS/OIS, and the bounded production environment route consumes only its declared constant-axis rotation.
- Native sensor readout timing currently uses a caller-declared uniform-linear single-axis spatial phase approximation. Capture data-readout duration and rolling spatial skew are distinct evidence-backed facts; the model does not infer one effective raster row/column as one physical hardware readout line and does not yet model non-uniform/segmented readout or rolling-shutter image distortion.
- Readout/exposure linkage can assert only a normalized native spatial-phase/order relationship to an electronic exposure boundary. It does not establish absolute readout-vs-exposure timing, and equal directions or equal timing spans are never treated as proof of synchronization.
- Capture exposure-window timing models opening and closing boundaries independently as simultaneous or uniform-linear native scans. It validates positive local duration across the full active rectangle, but does not itself model curtain acceleration, segmented/nonlinear electronic timing, shutter shock, EFCS-specific pupil/bokeh behavior, or automatically equate exposure boundaries with sensor readout. The separate manual-flash foundation registers a pulse against this timing without redefining the #12 exposure-window contract.
- Capture rotation trajectories evaluate a stationary reference ray at local exposure start/end under pure constant camera rotation. The endpoint chord is not an integrated blur kernel, and the API is not an inverse destination-to-source rolling-shutter warp; separate instantaneous inverse mapping and midpoint temporal quadrature provide those geometric seams. Executed environment capture integrates declared radiance at its supported local shutter nodes.
- Capture rotation temporal quadrature supplies deterministic midpoint geometry samples across each local exposure. It does not sample scene radiance, output an averaged coordinate/blur radius, model shutter-transmission ramps, or claim a geometry-only error bound; downstream radiance integration remains separate.
- Instantaneous capture-rotation inverse mapping now provides destination-to-reference geometry at an explicit phase within each local exposure window. Pure rotation is inverted analytically, not iteratively. The result is still not a finite-exposure image or blur model; reference rays may validly fall outside the active source frame and are not clamped.
- The Airy diagnostic remains a separately named ideal circular-pupil size diagnostic. `calculateIdealPolygonDiffractionPsf()` adds continuous unit-energy density for ideal on-axis regular polygon pupils with explicit equal-area physical scaling; blade geometry alone does not supply a physical PSF. The real-lens framework owns explicitly profiled combined primary-optical PSFs and complex-pupil/wavefront propagation. Do not stack polygon diffraction over a kernel that already includes diffraction.
- Capture-mode profiles describe acquisition/sampling/reconstruction structure only. Grouped sampling does not imply charge-domain binning unless that domain is separately evidenced; processed-image resolution does not change FOV, physical sensor identity, or establish physical photosite count. Pixel-shift offsets are expressed in native effective-sampling-pitch units and do not claim photodiode pitch.
- Color-sampling topology is independent from `NativeImageRaster`: periodic mosaic phase is anchored to absolute native sensor sampling-site indices, not crop-local coordinates. Channel IDs are semantic labels rather than spectral response curves. Layered color uses a separate unresolved spatial reference and remains structural-only until per-layer sampling density/registration is explicit; sparse non-periodic exceptions such as PDAF/masked/defect sites are not represented by schema 0.1.0.
- Native-effective-raster/color-site binding requires its own evidence and is tied to one exact native raster; matching dimensions alone never prove 1:1 CFA correspondence. Grouped capture modes also require an evidenced full-frame top-left grouping phase. The bridge reports compact pre-reconstruction source rectangles and channel-site counts only—no sum/average weights, spectral response, downstream reconstructed-pixel dependency, or photodiode count. Pixel-shift offsets do not change CFA channel assignment because sensor and CFA move together.
- Sensor optical-stack schema 0.1.0 separates physical component presence from effective anti-aliasing response. Omitted AA response means unknown, while explicit `absent` means no intentional AA spatial-splitting term in this contract—not an identity whole-stack PSF or zero aliasing risk. Point-splitting kernels are normalized spatial redistribution only and exclude throughput, spectral transmission, field/wavelength/polarization dependence, cover-glass refraction, and microlens behavior.
- Sensor sampling-aperture schema 0.1.0 keeps color-site physical registration separate from both `NativeImageRaster` and radiometry. Site pitch/origin must be explicitly evidenced; aperture geometry is not inferred from pitch or fill fraction. The first resolved aperture is a uniform axis-aligned geometric sensitive rectangle contained within one lattice cell. Its derived sensitive-area fraction is a geometry diagnostic only—not QE, effective collection area, microlens behavior, charge diffusion/crosstalk, spectral response, or optical throughput.
- Sensor spatial quadrature inverse-samples the pre-AA optical field through the declared AA split and geometric aperture. Destination CFA channel remains authoritative for all nodes; pre-AA source coordinates never reassign CFA color. Off-imaging-area source support is exposed rather than clamped/dropped, normalized weights remain unchanged, and square-micrometre measures remain geometric—not radiometric collection area.
- Sensor spectral-response schema 0.1.0 treats channel IDs as labels until explicit wavelength-dependent data is supplied. Direct effective EQE, direct A/W responsivity, and explicitly separable filter×detector-QE are distinct representations; response curves require reusable-data/Photivra-owned provenance, never extrapolate outside their wavelength range, never convert air/vacuum wavelength coordinates implicitly, and do not model field-angle/temperature/polarization dependence or perform wavelength/photon/electron integration.
- Signal/noise primitives require caller-supplied photon/electron quantities. The radiometry-readiness API can assess declared prerequisites, but it does not derive photons or enable photon/noise output in the composed POC.
- The composed POC still uses one representative pixel-pitch path internally and therefore rejects sensor geometry whose X/Y sample pitch differs by more than 1%; lower-level geometry APIs already preserve independent X/Y pitch.
- No named commercial camera or lens performance is claimed.

See [Physics Foundation](https://github.com/Photivra/photivra/blob/main/docs/PHYSICS_FOUNDATION.md), [Motion and Signal Foundation](https://github.com/Photivra/photivra/blob/main/docs/MOTION_AND_SIGNAL.md), and [Camera Shake and Stabilization](https://github.com/Photivra/photivra/blob/main/docs/STABILIZATION.md) for details.

## Principles

- Independently implement established photography, optics, sensor, motion, and imaging mathematics.
- Do not copy code, datasets, calibration tables, model weights, or protected technical expression unless reuse rights are explicit and compatible with Apache-2.0 distribution.
- Treat publicly viewable material as reference material only; public availability is not permission to copy, and independent implementation does not by itself resolve third-party patent rights.
- Keep calculations deterministic and testable where the model itself is deterministic.
- Prefer explicit units, versioned schemas, consistent public APIs, and reproducible results.
- Label results by provenance: calculated, calibrated, estimated, or approximation.
- Report uncertainty/accuracy metadata only when it is defensible; never invent aggregate confidence or error bars.
- Keep the repository focused on reusable scientific/business logic, validation, schemas, tests, documentation, and contributor tooling.

## Runtime surfaces

The package is ESM-only.

The root export is the runtime-neutral scientific surface:

```ts
import {
  calculateFieldOfView,
  simulatePocCamera
} from "@photivra/engine";
```

The root dependency graph is checked in CI so Node-only modules and the repository-local HTTP POC server cannot become reachable from that browser-facing surface.

The open repository still contains a minimal Node HTTP POC server under `src/api` for contributor integration testing. It is deliberately **not** exported by `@photivra/engine` and is excluded from the published npm package. It is unauthenticated and is **not** a production hosting recommendation.

When the package is installed directly from a Git repository using normal npm lifecycle scripts, `prepare` builds `dist` before consumption.

## Development

Development and Node-only tooling support maintained Node.js 22 (minimum 22.13), maintained 24, and 26 Current. Prefer patched Node 24 for builds. CI verifies Node.js 22.13 (minimum), patched 22 and 24 LTS, and 26 Current under [the runtime policy](NODE_SUPPORT.md).

The reproducible npm workflow uses the committed lockfile:

```sh
npm ci
npm run check
npm run coverage
npm run build
npm run pack:check
```

Coverage gates are currently:

- 90% lines;
- 90% statements;
- 90% functions;
- 80% branches.

The deterministic fuzz/property suite uses fixed seeds so failures are reproducible.

Yarn and pnpm may be used for development, but the repository's release/CI dependency resolution is defined by `package-lock.json` and `npm ci`.

## Validation boundaries

TypeScript types are not treated as validation for untrusted data.

- Use `parseCameraConfiguration()`, `parseSceneDefinition()`, `parseSensorArchitectureProfile()`, and `parseRadiometryReadinessProfile()` for their respective external JSON/configuration boundaries.
- The repository-local Node POC HTTP layer has its own structural request parser before invoking `simulatePocCamera()`.
- Scientific range/domain validation remains in the calculation modules.
- Public `CalculationResult<T>` envelopes reject non-finite numeric output.

## Citation

GitHub can generate citation text from [CITATION.cff](https://github.com/Photivra/photivra/blob/main/CITATION.cff). Use that metadata when citing Photivra in research, technical documentation, or reproducible analyses.

## Licensing

Source code in this repository is licensed under Apache-2.0 unless a file clearly states otherwise. See [LICENSE](https://github.com/Photivra/photivra/blob/main/LICENSE), [NOTICE](https://github.com/Photivra/photivra/blob/main/NOTICE), and [THIRD_PARTY.md](https://github.com/Photivra/photivra/blob/main/THIRD_PARTY.md).

The Apache license does not grant trademark rights to the Photivra name, logos, or branding except as allowed by applicable law and the license itself.
