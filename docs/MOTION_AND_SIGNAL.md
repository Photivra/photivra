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

The model can represent a representative point moving laterally and/or along the optical axis. It does **not** yet model an extended object's changing apparent scale across the exposure, rotational subject motion, acceleration, deformation, or occlusion changes. A large object moving significantly in depth can therefore exhibit real scale blur that this point-displacement primitive does not describe.

Camera motion is not folded into subject motion. Camera shake is modeled separately by `estimateCameraShakeBlur()`; panning detection/intent is not currently modeled.

## Exposure relations

`calculateExposureValue100()` implements EV100 from aperture and shutter duration.

`calculateRelativeOpticalExposure()` compares the proportional image-plane exposure relation `t / N²`.

These calculations do not imply a photon count because they do not include scene radiance, lens transmission/T-stop, vignetting, spectral response, or sensor calibration.

`calculateEquivalentIso()` treats ISO as nominal gain/brightness compensation needed to preserve rendered exposure after an aperture/shutter change. It is not used as a shortcut for noise or photon creation.

## Signal/noise primitives

The root package also exports low-level deterministic sensor primitives:

- `calculatePhotoelectrons()`: caller-supplied mean incident photons × caller-supplied quantum efficiency;
- `calculateSignalToNoise()`: Poisson shot-noise standard deviation plus independent caller-supplied RMS read noise, reported as linear and dB SNR.

These functions do **not** derive incident photon counts from scene imagery.

They do not currently model dark current, fixed-pattern noise, PRNU/DSNU, ADC quantization, clipping/full-well behavior, CFA/demosaic, downstream denoising, or a particular commercial sensor.

The composed POC intentionally does not expose photon/noise output until there is a defensible calibrated radiometric path including the necessary scene, spectral, optical-transmission, pixel-area, quantum-efficiency, and calibration assumptions.

## Provenance

The equations in this slice are independently implemented from established projective geometry, exposure relations, and elementary photon/statistical noise models. No third-party source code or calibration dataset is incorporated by these modules.
