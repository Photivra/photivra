# Signal cross-domain conformance (#131B)

Release context: **package 1.0.0 candidate / root API 0.116.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0.md).

`test/signal-conformance.test.ts` independently covers merged public APIs without consuming unmerged capture, output, optics or tier work. It complements the geometric conformance draft rather than depending on it. The canonical #130 fixture supplies wavelength and reference aperture/shutter/ISO settings; its source irradiance is **not** silently treated as detector energy.

The explicit thought experiment supplies 4e-17 J already incident at one measurement region, constant test QE 0.5 and independent RMS read noise 3 electrons. These are Photivra-owned illustrative inputs, not calibrated equipment values. Vacuum wavelength is declared for this analytic variant. No photosite area is inferred from image sampling pitch, and no continuous spectral density is reinterpreted as a delta line.

Independent expectations use exact SI h and c, E_photon = hc/lambda, mean electrons = incident energy / E_photon × QE, and SNR = mean electrons / sqrt(mean electrons + read noise squared). Relative optical exposure scales the supplied reference energy only under the explicitly stationary ideal t/N² thought experiment.

Covered invariants:

- Fractional mean electron counts survive without rounding; repeated evaluation is exact and deterministic.
- Doubling duration doubles mean signal but increases shot-limited SNR by sqrt(2), not 2.
- Half the exposure duration plus double nominal ISO preserves nominal rendered exposure, but not mean physical signal or signal-to-noise ratio. ISO does not create photons.
- At fixed supplied energy, doubling vacuum wavelength doubles photon/electron expectations **only for this declared constant-QE experiment**, not a real sensor spectral response claim.
- Zero QE produces JSON-safe zero SNR/null dB; invalid photon counts fail before downstream noise calculation.

Normalized floating-point ratios use 13-decimal-place tolerances to avoid absolute tolerances inappropriate for joules around 1e-19. This is arithmetic/regression evidence, not a quantified physical uncertainty.

This suite intentionally does not authorize a production radiance-to-RAW path. Spectral quadrature, response applicability, collection area, local exposure/stationarity, dark current, full-well, stochastic realizations, analog/ADC clipping and reconstruction keep their existing separate gates. The primitive calculation provenance does not upgrade these illustrative inputs to calibration. It does not exercise a sensor temperature or real-camera ISO mode.

No API/runtime/version/dependency change. #131 closed through reviewed/signed PR #206; the final integrated conformance suite covers merged paths, outputs, presets and performance dispositions. This earlier slice remains independent evidence.
