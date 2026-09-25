# Physics Foundation

Photivra starts with analytical models that can be independently tested and whose assumptions can be stated explicitly.

## Implemented models

### Rectilinear field of view

The rectilinear relation is:

`FOV = 2 atan(d / (2v))`

where `d` is the relevant sensor dimension and `v` is the projection/image-plane distance.

When no focus distance is supplied, `v = f` is the infinity-focus/pinhole compatibility approximation. When focus distance is supplied, `v` is the ideal Gaussian thin-lens image distance.

For a centered sensor interval, the usual symmetric form is sufficient. For an off-center sensor interval, Photivra uses signed sensor-plane bounds relative to the optical axis:

`FOV = atan(x_max / v) - atan(x_min / v)`

This preserves asymmetric left/right or top/bottom angular limits instead of pretending every active crop is centered.

### Sensor geometry, sampling, capture, and crop

Photivra separates physical image-formation geometry from digital sampling.

`SensorImagingArea` represents the physical photosensitive area used for image formation. It is not a sensor package/die dimension.

`NativeImageRaster` represents the effective native image-sampling grid. It does not imply that one output/image sample corresponds one-to-one with one physical photodiode. Generic active/output rasters use `RasterDimensions`.

Geometric sample pitch is derived independently on each axis:

- `pitchX = imagingWidth / nativePixelWidth`;
- `pitchY = imagingHeight / nativePixelHeight`.

These pitches are geometric sample spacing only. They are not fill factor, effective collection area, or photon-collection area.

The capture pipeline is staged:

```text
physical imaging area + native raster
              ↓
native active-capture rectangle
              ↓
physical camera orientation
              ↓
oriented active capture
              ↓
digital/output crop
              ↓
output raster
```

Native raster coordinates use a top-left origin with +X right and +Y down. Integer rectangles are half-open. Physical camera rotation does not redefine the native coordinate system; Photivra transforms points, vectors, and rectangles explicitly between native and oriented coordinates.

For the generic sensor model, active physical dimensions and optical-axis offset are derived by assuming the native sampling grid uniformly spans the declared physical imaging area. This assumption is recorded because a future calibrated camera profile may need explicit physical active-area data instead.

An off-center active rectangle changes both retained physical extent and angular position relative to the optical axis. It must therefore use asymmetric angular bounds rather than a centered FOV formula.

For an off-center rectangular active area, the two opposite-corner diagonal angular spans need not be equal. `calculateActiveCaptureFieldOfView()` reports both and uses the larger span for its compatibility `diagonalDegrees` summary.

Output crop/resampling is digital geometry. It does not mutate physical sensor identity or active-capture geometry. Output raster aspect ratio must remain consistent with the selected output crop; implicit geometric stretching is rejected.

Centered crop dimensions are derived from a linear crop factor while preserving source aspect ratio, subject to integer pixel flooring.

Subject-height framing crop computes the additional same-aspect crop needed to target a requested subject-height fraction. It assumes the crop can be positioned around the subject and does not check subject position against image edges.

### Crop factor and 35 mm-equivalent focal length

Physical crop factor is diagonal-based relative to a 36 × 24 mm reference frame:

`cropFactor = diagonal_35mm / activeCaptureDiagonal`

Conventional 35 mm-equivalent focal length is:

`equivalentFocalLength = actualFocalLength × cropFactor`

The actual focal length remains the optical focal length. Equivalent focal length is a derived framing convention; it does not replace physical focal length in projection or depth-of-field calculations.

Photivra bases equivalence on the active physical capture area, not later digital/output crop. Physical orientation leaves the active diagonal unchanged and therefore does not change diagonal-based equivalent focal length. Different aspect ratios can still produce different horizontal/vertical FOV even when the single diagonal-equivalent number is the same.

### Projection, focus extension, object size, and motion

Field of view, projected fronto-parallel object size, projected representative-point subject motion, and camera-shake projection support two explicit projection modes:

- **pinhole/infinity-focus compatibility mode** when no focus distance is supplied: nominal focal length is used as the projection distance;
- **focus-aware thin-lens mode** when a focus distance is supplied: sensor-plane projection distance is calculated from the Gaussian thin-lens relation `1/f = 1/s + 1/v`.

There is no hidden distance threshold or discontinuous transition between the modes. The caller chooses the model by supplying or omitting focus distance.

At a focus distance of at least 100 focal lengths, the ideal thin-lens projection-distance scale differs from the infinity-focus approximation by no more than about 1.011%. For example, 200 mm focused at 22 m (110 focal lengths) changes projected scale by about 0.92%.

The focus-aware model improves internal consistency with thin-lens DOF/defocus calculations, but it is still an ideal paraxial model. It does not model real-lens focus breathing, pupil magnification, principal-plane movement, distortion, aberrations, or lens-specific macro behavior.

Projected subject motion is a representative-point displacement model with constant linear world velocity. It does not yet describe scale blur of an extended object whose magnification changes materially during the exposure.

### Thin-lens focus and depth of field

The geometric depth-of-field model uses the conventional hyperfocal/near/far equations with a caller-supplied acceptable circle of confusion.

The circle-of-confusion criterion is a viewing/acceptability input, not a physical sensor threshold. The optional equivalent-viewing helper scales a caller-supplied reference criterion by sensor-diagonal ratio and is explicitly labeled an approximation.

In composed POC capture mode, the equivalent-viewing helper uses the final retained physical image region that will be enlarged to the assumed final viewing size. Active capture, digital output crop, and centered subject framing can therefore change the viewing criterion; output pixel resolution alone cannot. This changes only the viewing/acceptability convention, not the physical optical blur. An explicit caller-supplied `circleOfConfusionMm` is never rescaled.

The model is not a macro calibration model and does not include diffraction, pupil magnification, aberrations, focus breathing, or lens-specific principal-plane behavior in its DOF criterion.

### Defocus circle

Defocus is calculated geometrically by comparing the selected sensor plane for the focus distance with the ideal image plane for the subject distance and projecting an ideal circular entrance-pupil cone to the sensor.

### Diffraction

For an ideal circular aperture, first-zero Airy diameter is:

`d = 2.44 λ N`

where `λ` is wavelength and `N` is f-number.

This is a monochromatic, ideal-circular-pupil diagnostic.

It is deliberately separate from regular-polygon aperture geometry used for bokeh/sunstar exploration. Supplying a polygon blade count does not convert the circular Airy result into a polygon-aperture diffraction PSF; a physically consistent non-circular diffraction model remains future work.

### Ideal diaphragm geometry and sunstar symmetry

For a regular straight-edged diaphragm, the engine calculates normalized polygon vertices and idealized sunstar direction symmetry perpendicular to blade edges.

For even blade counts, opposite parallel edges produce overlapping opposite directions, yielding the same number of unique directions as blades.

For odd blade counts, there are no parallel opposite-edge pairs, yielding twice as many directions as blades.

This is a geometry/orientation model only. It does not calculate diffraction intensity, wavelength-dependent star length, blade curvature, coatings, internal reflections, lens aberrations, sensor blooming, or a complete point-spread function.

### Controlled camera shake

Yaw and pitch angular velocity are integrated over shutter duration. Their angular displacement is projected to the image plane using the selected projection distance.

The current model returns one global image-plane vector. It does not compute the spatially varying optical flow that a real camera rotation produces away from the optical axis.

Equivalent stabilization stops attenuate angular displacement by `2^-stops`; that attenuation is explicitly an educational approximation rather than a real IBIS/OIS or CIPA performance model.

### Radiometry readiness boundary

Absolute scene luminance or relative exposure alone is not enough to derive a defensible photon count.

Before any future composed photon simulation, Photivra requires an explicit prerequisite package covering:

- scene spectral radiance or a documented spectral approximation;
- optical transmission;
- pupil/vignetting behavior;
- photosite collection-area semantics;
- exposure integration;
- sensor spectral response / quantum efficiency;
- evidence and uncertainty/limitation metadata for each component.

`assessRadiometryReadiness()` can classify a declared package as `not-ready`, `approximate-only`, or `calibrated-ready`. This classification validates the declared model/evidence structure; it does not prove that the calibration is scientifically correct and does not itself calculate photons.

Geometric sample pitch is intentionally insufficient as a collection-area model. A profile must provide either an effective collection area or geometric cell area plus explicit fill factor.

Approximate inputs remain approximate even when every prerequisite category is present. A calibrated-ready declaration requires calibrated components with quantified uncertainty.

The composed POC continues to emit no photon/photoelectron/SNR output from scene settings. Low-level `calculatePhotoelectrons()` remains a separate primitive for callers that already possess a defensible incident-photon count and QE.

## Source provenance

These implementations were written independently from established mathematical/physical relations. No third-party source code, calibration dataset, table, or model weight is incorporated by these scientific modules.

Public technical references may be used to understand or validate concepts, but their code, protected prose, tables, figures, or restricted measurement data are not copied unless separately licensed for that use. See [Scientific and Source Provenance](PROVENANCE.md).

## Scope

These models produce numerical indicators, not a universal "sharpness score." Sampling, defocus, diffraction, subject motion, and camera shake describe different physical effects and should not be directly added together without a justified image-formation model.

Rendering and analysis clients should consume validated numerical outputs rather than silently introducing conflicting camera science.
