# Incremental scientific conformance: #131

The cross-stage conformance layer complements, rather than replaces, narrow unit tests. `test/cross-stage-conformance.test.ts` consumes #130's canonical owned fixture and merged public APIs only. It checks a coherent ideal-focus/projection→FOV/object-size→pixel-motion/defocus path, then controlled one-stop shutter and aperture variants across exposure, motion and diffraction.

Expectations follow independent Gaussian thin-lens reciprocal distance, angular span reconstruction, millimetre/micrometre pixel conversion, shutter-proportional lateral displacement, t/N² relative optical exposure, and wavelength/f-number Airy scaling. Neutral stationary/in-focus states and non-neutral variants preserve calculated provenance. Relative exposure is not photon-count evidence; no source/sensor calibration is inferred.

`test/signal-conformance.test.ts` adds independent energy/photon/QE/noise identities, including physical shutter exposure versus nominal ISO/rendered exposure. These analytic inputs are not a calibrated scene-to-sensor integration.

## Capture and processed-output slice

`test/raw-output-conformance.test.ts` exercises the merged capture-owned global sensor producer through charge/capacity/noise/ADC, immutable native CFA attachment, explicit reconstruction, declared color interpretation, WB, correction, SDR encoding and paired export. It imports no pending preset, local-exposure or performance draft.

The fixture reuses #130's 36×24 mm imaging area, 50 mm f/4 lens, 5 m focus, 0.008 s shutter, ISO 100 and stochastic seed. It explicitly replaces the 600×400 native raster with a **6×4 Bayer regression lattice**: square 6 mm pitch, 24 sites. These dimensions are deliberately artificial, suitable for fast ordering/geometry checks, not pixel fidelity, demosaic quality, camera calibration, editor interoperability or performance. The canonical JSON is unchanged. Existing owned phase kernels average each 2×2 tile; six synthetic tile levels and channel differences make an incorrect orientation or source shift observable. Photoelectron expectations are supplied directly, with zero dark expectation and the existing synthetic readout profile (2 electron RMS read noise, 1 electron/code, black 64, white 1023, 1000 electron capacity). No scene radiance, wavelength response or spectral integration is inferred from these numbers.

Independent expectations are calculated from the emitted integer RAW codes, without using engine reconstruction, orientation, correction or SDR functions as an oracle:

| Boundary | Conformance evidence |
| --- | --- |
| Native capture → DNG | Every stored 16-bit strip code equals the produced post-ADC code, without container stretching. Native codes and noise remain identical through four output orientations. |
| RAW → reconstruction → color/encoding | Tile red/blue values and mean of the two green sites are independently black-subtracted and normalized by 959. The declared ideal RGB→XYZ→RGB round trip must preserve them within numeric tolerance. Integer orientation permutations and the piecewise sRGB transfer/8-bit rounding predict every processed pixel. |
| Shutter / ISO / rendering exposure | Twice the shutter doubles expected charge at fixed rates. ISO-only metadata does not change the explicitly selected readout regime, realized charge, RAW codes or processed pixels. Rendering +1 EV doubles linear rendering values while keeping RAW codes and RawDataUniqueID unchanged. No monotonic claim is made about individual Poisson draws. |
| WB → exposure → tone → encoding | Non-neutral gains (2, 1, 0.5), +1 rendering EV and positive Reinhard tone are evaluated independently in sequence. This catches double WB, WB after tone and transfer/quantization ordering errors. |
| Native correction → joint support → orientation | Identity correction preserves the plain processed pixels and view. A one-native-pixel shift reuses the exact noisy capture, excludes the unsupported native edge and yields independently predicted source pixels through all four orientations. RAW codes/default crop/data identity stay unchanged; RAW correction intent is metadata-only. |
| Signed dark values / display clipping | Zero photo/dark expectations preserve below-black read noise in stored RAW and signed reconstruction. Low clipping happens downstream. A separate +8 EV rendering clips all output channels without claiming physical or ADC capture saturation. |
| Unsigned ADC lower boundary | Explicit large read-noise variants with black 0/64 exercise lower-code clamping and separate upper pre-ADC/digital saturation at zero stored charge. Negative electronic noise is not mistaken for negative stored charge. |

Complete file bytes are checked for repeated-export determinism on the neutral rendering path. The strip reader here is a bounded structural regression check, not an independent external RAW editor or TIFF implementation. JPEG **pre-encoding pixels** are the analytic rendering oracle; a lossy JPEG decode is not used to prove exact pixel identity. Existing #16 decoder/editor acceptance remains separately authoritative.

The producer's `upstreamRadiometryVerified: false`, reconstruction's `producerOriginVerified: false` and approximation provenance remain visible. The fixture's unrelated inline float plane contains 999 values; it cannot supply the JPEG reconstruction. ISO independence applies to this explicit regime configuration, not to all future ISO-dependent body profiles.

The shadow check exposed a readout ordering defect: clamping negative electronic noise to zero electrons before adding the pedestal erased valid below-black RAW values. The correction preserves signed electronic signal through the upper-only pre-ADC threshold, adds the black offset, quantizes and then clamps to unsigned code zero/common digital saturation. Physical stored charge remains nonnegative. Readout provenance advances to model **2.0.0** and the producer's required capture noise identity advances to **0.2.0**, rejecting old 0.1.0 producer replay instead of silently recomputing changed shadows. See `SENSOR_RAW_PRODUCER.md` for migration. Public input/output field shapes remain unchanged; root API advances to 0.104.0. Existing positive electronic-signal code math and RNG seed schedule are unchanged.

## Remaining acceptance

These incremental slices do not close #131. Scene radiance/throughput/metering and reserved production sensor/processing composition still require coherent cross-stage coverage. Final acceptance must also consume the merged equipment-tier and performance dispositions. Pending drafts are not imported as main APIs. No schema/package/POC version, network, Blender or private-app dependency is changed. Final closure remains last under #129 and preserves #16's independent external-file interoperability gate. AI-assisted contributions require substantive human review and contribution-specific DCO certification under `AGENTS.md` before merge.
