# Motion and Signal Foundation

## Projected subject motion

Subject-motion blur is modeled from image-plane displacement rather than broad labels such as "fast sport" or "slow subject."

`calculateProjectedMotionBlur()` projects one representative scene point at shutter open and shutter close after applying constant world-space linear velocity. The difference is the sensor-plane displacement.

Projection has two explicit modes:

- when `focusDistanceM` is omitted, nominal focal length is used as the backwards-compatible infinity-focus/pinhole projection distance;
- when `focusDistanceM` is supplied, the ideal Gaussian thin-lens image distance for that focus plane is used.

Projected displacement therefore depends on:

- focal length;
- optional focus-plane extension;
- shutter duration;
- starting object position/distance;
- motion direction;
- object velocity;
- optional sensor pixel pitch for pixel-domain reporting.

The low-level motion primitive still accepts one scalar pixel pitch. The newer sensor-geometry API preserves independent X/Y geometric pitch. The composed POC therefore fails closed when X/Y pitch differs by more than 1% rather than silently applying horizontal pitch to materially different vertical sampling.

The model can represent a representative point moving laterally and/or along the optical axis. It does **not** yet model an extended object's changing apparent scale across the exposure, rotational subject motion, acceleration, deformation, or occlusion changes. A large object moving significantly in depth can therefore exhibit real scale blur that this point-displacement primitive does not describe.

Camera motion is not folded into subject motion. Camera shake is modeled separately by `estimateCameraShakeBlur()`; panning detection/intent is not currently modeled.

The returned `deltaXmm`/`deltaYmm` components are legacy camera/image-plane components: +X right and +Y up. They are preserved for compatibility.

Capture raster coordinates use +X right and +Y down. POC API 0.19 therefore converts a legacy image-plane vector to native raster axes as `{ x, y: -y }` before applying the native↔oriented rotation helper. The additive capture diagnostics expose `nativeRasterDeltaPixels`, `orientedCaptureDeltaPixels`, and `outputDeltaPixels`; the legacy motion fields are not reinterpreted.

## Temporal image-formation basis

The image-formation contract defines physical time in **seconds from exposure start**.

A future spatial camera-rotation model should be evaluable at arbitrary physical times rather than returning only one finished full-frame displacement. That allows global exposure and later rolling readout to consume the same camera-motion model.

Exposure duration and sensor readout timing are independent concepts:

- global readout can still contain subject/camera motion blur;
- rolling readout changes the exposure/readout schedule across native sensor locations;
- physical orientation does not redefine native sensor scan direction;
- depth-dependent camera translation is not part of the initial rotational-flow model because parallax depends on scene depth.

## Exposure relations

`calculateExposureValue100()` implements EV100 from aperture and shutter duration.

`calculateRelativeOpticalExposure()` compares the proportional image-plane exposure relation `t / N²`.

These calculations do not imply a photon count because they do not include scene radiance, lens transmission/T-stop, vignetting, spectral response, or sensor calibration.

`calculateRelativeRenderedExposure()` combines the relative optical exposure with the nominal ISO gain ratio (`iso / referenceIso`) and reports both the linear factor and stop difference. It is intended for deterministic relative rendering against a declared reference, not for radiometric calibration; it does not model photon creation, sensor noise, clipping, tone mapping, or lens transmission.

`calculateEquivalentIso()` treats ISO as nominal gain/brightness compensation needed to preserve rendered exposure after an aperture/shutter change. It is not used as a shortcut for noise or photon creation.

## Signal/noise primitives

The root package also exports low-level deterministic sensor primitives:

- `calculatePhotoelectrons()`: caller-supplied mean incident photons × caller-supplied quantum efficiency;
- `calculateSignalToNoise()`: Poisson shot-noise standard deviation plus independent caller-supplied RMS read noise, reported as linear and dB SNR.

These functions do **not** derive incident photon counts from scene imagery.

They do not currently model dark current, fixed-pattern noise, PRNU/DSNU, ADC quantization, clipping/full-well behavior, CFA/demosaic, downstream denoising, or a particular commercial sensor.

The composed POC intentionally does not expose photon/noise output.

The root package now includes a **radiometry-readiness gate** that validates whether a declared prerequisite package contains scene spectral radiance, optical transmission, pupil/vignetting behavior, explicit photosite collection-area semantics, exposure integration, sensor response, evidence, and uncertainty declarations.

Readiness is deliberately separate from signal/noise calculation:

- `not-ready`: prerequisite categories are missing;
- `approximate-only`: all categories exist, but at least one is approximate or has unquantified uncertainty;
- `calibrated-ready`: all categories are declared calibrated with quantified uncertainty.

These states describe the declared prerequisite package only. They do not prove a calibration is correct, do not calculate incident photons, and never enable photon/noise output in `simulatePocCamera()` automatically.

Geometric pixel/sample pitch is not accepted as photon-collection area. An explicit effective collection area or geometric cell area plus fill factor is required.

## Provenance

The equations in this slice are independently implemented from established projective geometry, exposure relations, and elementary photon/statistical noise models. No third-party source code or calibration dataset is incorporated by these modules.
