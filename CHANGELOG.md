# Changelog

## 2.0.0 — unreleased (prepared October 17, 2026)

A major release.

**In short.** 2.0.0 fixes correctness problems found in the first 2.0 review, makes several parts much faster without changing their output, and adds a large set of new features. Some of the fixes change numbers that 1.x produced, change stored identities (hashes and seeds), or reject input that 1.x accepted. Any of those can break existing users, so the version number goes from 1 to 2. Root exports grow from 1,227 to 1,648 symbols, and none is removed.

What it contains:

- the correctness fixes and bit-identical performance work of the first 2.0 review (#270–#288);
- the 2.0 feature streams (#290–#304): sensor gain and fixed-pattern noise, colorimetry, RAW development fixes, optics, rolling shutter and flash, export formats, image processing, the `simulateCapture()` facade (a single simple entry point), and an opt-in WebGPU backend.

See [the 2.0.0 release record](https://github.com/Photivra/photivra/blob/main/docs/RELEASE_2_0_0.md) for the science evidence and the compatibility table.

### Breaking changes

Each item ends with its *Migration* (what an existing user must do). Several items only add new values to a type union. Those break only code that switches over every value of that type (an exhaustive switch).

**Sensor and noise**

- **Noise model `photivra-native-raw-noise` 0.4.0, with independent per-site seeds (#270, #283, #290).**
  - *Why:* the old seed schedule, `seed + 2i`, gave neighbouring pixels a lag-1 noise correlation of about 0.84, so their noise was not independent.
  - *What changed:* per-site charge and read-noise seeds are now `MurmurHash3_x86_32(captureSeed, absoluteNativeIndex, streamId)` (seed schedule `murmur3-capture-seed-native-index-stream-v2`). `createRandom` scrambles its seed with the MurmurHash3 `fmix32` finalizer.
  - *Effect:* every realized RAW code and every recorded seed changes, including direct `simulateSensorChargeRealization`/`simulateSensorRawCode` calls. Result model versions: charge realization **3.0.0**, stochastic RAW code **4.0.0**, expected readout **2.0.0**.
  - *Migration:* results stay deterministic for a given seed at any tile width, but 1.x realizations cannot be reproduced. Captures, plans and replays that carry noise model 0.1.0–0.3.0 are rejected. Re-capture with 2.0.0, and keep old outputs as historical artifacts.
- **ISO now drives sensor gain; generic tier presets 2.0.0 (#290).**
  - *What changed:* readout regimes `base`/`high` are replaced by one regime per ISO, `iso-<S>`, with 12-bit (consumer) or 14-bit ADCs (analog-to-digital converters). `presetVersion: "1.0.0"` is rejected. The producer rejects a regime whose `exposureIndexGain.exposureIndex` differs from `capture.exposure.iso`.
  - *New required result fields:*
    - `SensorChargeRealization` gains `fixedPatternNoiseProfileId`, `photoResponseGainFactor`, `darkCurrentFactor`, `hotPixel`, `photoSampledMeanElectronCount` and `darkSampledMeanElectronCount`.
    - `SensorRawCodeSample` gains `fixedPatternNoiseProfileId`, `fixedPatternReadoutOffsetElectrons`, `adcIntegralNonLinearityOffsetCodes`, `adcCodeBeforeDigitalGain` and `digitalGain`.
    - `SensorExpectedReadoutSignal` gains `adcIntegralNonLinearityOffsetCodes`, `digitalGain` and `expectedCodeAfterDigitalGain`. `expectedDigitalSaturation` now uses the code after digital gain.
  - *Migration:* save selections and optical states with preset 2.0.0, and pick the `iso-<S>` regime that matches the capture ISO.
- **Capacity assessments are bound to their charge (#273, #280).**
  - *What changed:* an assessment must match the charge it is applied to, by exact equality of `totalExpectedStoredElectronCount`, on both readout paths. The stochastic path reports `digitalSaturationApplied` once the code reaches (`>=`) the digital saturation code.
  - *Migration:* compute the assessment from the same charge you pass.

**RAW development and DNG**

- **RAW development output changes (#295).**
  - *What was wrong and is now fixed:* white balance was applied twice with camera matrices that were not white-normalized. Normalization now uses the effective white rather than digital full scale. Clipped highlights stay neutral, and saturation flags are honoured.
  - *DNG output changes:* WhiteLevel, AsShotNeutral, BlackLevel/CFAPattern phase (now relative to the ActiveArea origin) and DNGVersion (now 1.4).
  - *Effect:* `simulationHash` and file hashes change. `diagnostics.captureSaturation` can be `"consumed-in-raw-development"`.
  - *Migration:* re-develop and re-export; update stored hashes.
- **New required RAW fields (#295).**
  - `NativeRawOutput` requires `effectiveSaturationCodes` (one Uint16 per CFA phase).
  - `SensorRawCaptureSample` requires `effectiveSaturationCode`, `systemConversionGainElectronsPerCode` and `readNoiseRmsElectrons`, each constant per CFA phase.
  - *Migration:* hand-built RAW objects must supply them. `calculateEffectiveSaturationCode` computes the first.
- **`createNativeRawDevelopmentTask` takes ownership of `input.raw` (#295).**
  - Its arrays are detached (zero-copy `ArrayBuffer.transfer`, or copied where that is unsupported) and returned in `output.raw`.
  - RAW integrity errors (spans, flags, white levels) now surface from `run()`, not at creation.
  - The provider is now `{ yieldControl, onProgress? }`. A bare function is deprecated but still accepted in 2.x.
  - *Migration:* copy the RAW first if you still need it, and handle integrity errors from `run()`.

**Optics and geometry**

- **Exact thin-lens depth-of-field limits (#271, #279, #293).**
  - *What changed:* `calculateDepthOfField` (and `simulatePocCamera().depthOfField`) now uses the exact thin-lens formulas: near = s(H − f)/(H + s − 2f) and far = s(H − f)/(H − s), with far infinite (`null`) when s ≥ H. (s = focus distance, H = hyperfocal distance, f = focal length.) Model `thin-lens-depth-of-field` 1.1.0.
  - *Example:* for 50 mm at f/8, c 0.03 mm, s 5 m, the limits move from 3.394595/9.486405 m to 3.389371/9.527439 m.
  - It now rejects `circleOfConfusionMm ≥ focalLengthMm/aperture`.
  - `calculateDefocusCircle` uses a numerically stable closed form (model 1.1.0). Values change in the last bits, and more where cancellation used to occur.
  - *Migration:* update stored expectations. There is no option for the old approximation.
- **Camera rotation sign on all three axes, and shake pitch sign (#276, #284).**
  - *What was wrong:* 1.x produced the mirror image on every axis. Rotation mappings now follow the documented right-hand rule about camera +X/+Y/+Z.
  - *Now:* positive yaw gives `deltaMm.x = +d·tan(yaw·t)`; positive pitch gives `deltaMm.y = −d·tan(pitch·t)`; positive roll rotates content counter-clockwise.
  - *Effect:* everything built on the mappings changes with them: trajectories, temporal quadrature, rolling-shutter paths, aperture rays, environment radiance query and capture.
  - `estimateCameraShakeBlur()` keeps its yaw sign, but its pitch `deltaYmm`/`deltaYPixels` flip sign. It rejects a per-axis rotation ≥ π/2 over the exposure.
  - Rotation and stabilization provenance models go to 2.0.0.
  - *Migration:* to reproduce 1.x mappings, negate all three angular-velocity components. To reproduce 1.x shake values, negate the pitch rate.
- **Complex-pupil PSF zero padding and support bound (#276, #284, #293).** (PSF = point-spread function, how the lens spreads a point of light.)
  - *What changed:* `calculateLensComplexPupilPsf()` pads each axis to M = max(grid, 2S − 1). That is the exact condition for no wrap-around (Goodman sampling Q > 2).
  - *Effect:* pupils whose support exceeds (grid + 1)/2 samples get a larger kernel with different values (a full 5×5 disk becomes 9×9).
  - Support wider than `propagationDistanceMm / apertureFNumber` throws `InvalidScientificInputError`. `sampling.declaredPupilDiameterMm` reports that bound.
  - Model 2.0.0; tier envelopes re-baselined.
  - *Migration:* read kernel geometry from the returned kernel, and fix profiles whose support contradicts their f-number.
- **Crop rounding; crop models 2.0.0 (#276, #282, #293).**
  - *What changed:* `calculateCenteredCrop` floors the shorter axis, and derives the longer one as round(short · L / S), capped at floor(L / cropFactor). A quotient within 4 ulps (units in the last place) of the next whole pixel counts as that pixel.
  - *Effect:* the longer axis can be 1 px smaller than in 1.x (6000×4000 at 1.7× gives 3528×2352).
  - `calculateSubjectFramingCrop` no longer reports a subject that fits as clipped.
  - *Migration:* update stored crop dimensions.
- **35 mm crop factor (#293).**
  - *What changed:* the crop factor is now √(1872/(w² + h²)), and the diagonal avoids `Math.hypot`. Some `cropFactor35Mm`, `diagonalMm` and `equivalentFocalLength35Mm` values change by 1 ulp.
  - *Migration:* none for archives; stored focal equivalents are accepted within 8 ulps.
- **Type widenings (#296, #303).**
  - `LensSampledPsfProfile.interpolation` is the union `LensSampledPsfInterpolation`.
  - Front-of-lens filter `polarizationModeled` fields are `boolean`; filter `schemaVersion` is `"0.1.0" | "0.2.0"`; `compositionModel` gains a Stokes–Mueller value; results add `incidentPolarization`/`transmittedPolarization`.
  - `PreparedGeometricMapping.schemaVersion` is `"0.1.0" | "0.2.0"`; the transform purpose union gains `"projection"`; `DigitalGeometricTransform` gains two variants.
  - `SensorEnvironmentRadianceQuery.projection` can be `null` (only with a non-rectilinear mapping).
  - `ProductionImageFormationBlockerCode` gains `missing-lens-field-mapping`.
  - *Migration:* existing 0.1.0 profiles and documents work unchanged; update exhaustive switches.

**Exposure, motion and flash**

- **Flash, readout and metering unions (#297).**
  - `FlashSyncCapabilityProfile.highSpeedSyncSupported` is `boolean`, with optional `highSpeedSync`. `schemaVersion` is `"0.1.0" | "0.2.0"`. 0.1.0 documents parse unchanged and cannot claim HSS (high-speed sync).
  - `ProductionTemporalCaptureResult.readoutExposureSynchronization` adds `"electronic-rolling-shutter-line-linked"`.
  - `CreateManualFlashIlluminationOverlayInput.resolvedSync` widens to `FlashOverlaySyncRegistration`.
  - `ExposureMeteringPolicy` gains `highlight-priority`.
  - Metering provenance `relative-pre-exposure-metering` is 1.1.0, with no change in value.
  - *Migration:* update exhaustive switches; use a 0.2.0 sync profile for HSS.
- **White-balance source `"color-temperature"` (#291).**
  - `ResolvedWhiteBalanceState.source` and `CaptureWhiteBalanceIntent.source` gain this value.
  - The `adopted-white-xyz-scaling` variant of `CaptureColorWhiteBalance` gains an optional `transform`, which is rejected on other kinds.
  - *Migration:* add a case to exhaustive switches; existing serialized states still parse.

**Serialization, validation and export**

- **Stricter input validation (#276, #282, #293).**
  - Canonical JSON rejects non-plain objects (Map, Set, Date, typed arrays, class instances and similar) and array holes, instead of hashing them as `{}`. Output for plain JSON is byte-identical.
  - Root functions throw `InvalidConfigurationError` for null, primitive, array or missing sub-object input. Every calculator rejects unknown fields (next item).
  - `estimatedResult`/`calibratedResult` require `quality`, and result factories reject empty provenance identities.
  - `calculateSensorResponsivityPhotocurrent` always validates `operatingElectricalConditions` and returns them parsed.
  - `serializeProductionImageFormationPlan` rejects objects whose version or fingerprint does not match.
  - *Migration:* pass plain JSON, remove extra fields, and give factories a quality and a provenance.
- **Every calculator rejects unknown input fields (#276).**
  - *Why:* 1.x ignored an unknown field on 196 root functions, for example `calculateSignalToNoise()` and `calculateProjectedMotionBlur()`. A typo or a wrong unit suffix (`focusDistanceMm` for `focusDistanceM`) then fell back to a default without any error.
  - *What changed:* every root function that takes an input object now throws `InvalidConfigurationError` for an unknown top-level field, most with the message `<name> input has unknown field "<field>".` `test/root-export-input-errors.test.ts` lists every root function. The record parsers follow in the next item.
  - *Effect:* calls with extra fields now fail. `prepareImageFormationContext()` and `createProductionCaptureSnapshot()` still accept the `version` and `fingerprint` of a record they produced, and recompute both.
  - *Migration:* remove extra fields, and fix misspelled or wrong-unit field names. To change an engine result and pass it back, copy only the documented input fields.
- **Every record parser rejects unknown fields, at every level (owner decision, 2026-10-17).**
  - *Why:* the `parse*()` parsers and the functions that take a whole record silently dropped fields they did not know. A misspelled or stale field in a stored profile was lost without any error.
  - *What changed:* every `parse*()` record parser, and the 13 record-taking functions (`assessMtfOnlyPsfRenderability`, `assessRadiometryReadiness`, `assessSceneMaterialResponseFidelity`, `calculateEffectiveSaturationCode`, `createRollingShutterCaptureExposureSchedule`, `createTtlScaledFlashProfile`, `integrateDiscreteSpectralLineMeasure`, `prepareColorMatchingFunctions`, `prepareColorimetricSpectrum`, `resolveAntiAliasingSpatialKernel`, `resolveSceneIlluminationDiscreteLineMeasure`, `serializeProductionImageFormationPlan`, `validateCalculationQuality`), throws `InvalidConfigurationError` for an unknown field at any object level. The message names the path and the field, for example `sceneIlluminationProfile.sources[0].magnitude has unknown field "wattsPerSteradian".` Parsers that already had their own message keep it and add `Unknown field "<field>".` Each accepted schema version, and each `kind` of a record, has its own allowed fields, so a field of another version or kind is rejected too. Records the engine writes still parse: fixed flags such as `sceneRadianceCalculated: false` are accepted with their fixed value only, and a resolved boundary schedule may keep its derived `unitVectorNative` if it matches. `calculateEffectiveSaturationCode` accepts a `SensorRawCodeSample` plus the regime's `integralNonLinearity`, and nothing else. Scientific output is unchanged.
  - *Effect:* stored profiles and records with extra fields no longer parse. Old schema versions (for example filter 0.1.0, flash sync 0.1.0, sensor architecture 0.2.0) still parse when they hold only their own fields. Nested records passed to calculators are checked by the same parsers, so extra nested fields fail there too.
  - *Migration:* remove unknown fields from stored profiles and records; the error names the field.
- **Read-only result envelopes (#276).**
  - *Why:* a caller could change a result that another caller or a cache shared.
  - *What changed:* every `CalculationResult` is frozen. The envelope, `provenance` (with `assumptions`) and `quality` are frozen all the way down; `value` is frozen at its top level. `CalculationResult` marks `value`, `provenance` and `quality` as `readonly`. Nested objects inside `value` and typed arrays stay mutable; domains that own their data (captures, RAW, export metadata, presets) already freeze it deeply.
  - *Effect:* writing to a result throws a `TypeError` in strict-mode code (and fails silently in sloppy-mode scripts). The result factories also freeze the value, assumptions and quality objects you pass them. Every result costs a few `Object.freeze` calls (measured A/B against 28f8b61 on a shared 4-vCPU Xeon host, Node 24.21, medians of 3–5 alternating runs; indicative only):
    - per-point mapping calls (`npm run bench:image-formation`): about 0.3–0.45 µs more per call, 1.2–1.9× slower; the batch mapping APIs 0.91–1.08× (within noise);
    - `simulatePocCamera()` (`scripts/benchmark-composed-baseline.mjs`), which builds many internal results per request: 1.62–1.69× slower (11.9 → 19.6 µs per base request). Freezing only the envelope measured 1.15–1.28×; no freezing measured 0.97–1.20×;
    - native environment RAW (`scripts/benchmark-v1-environment.mjs`): 0.84–1.08×, within noise, because its lean executor builds few envelopes;
    - a generic deep freeze of `value` made a small scalar call about 3× slower and was not adopted. See `docs/API_STYLE.md` "Read-only results".
  - *Migration:* copy a value before changing it (`{ ...result.value }` or `structuredClone(result.value)`). Use the batch mapping APIs in per-point loops.
- **Consistent error classes (#276).**
  - *Why:* the same kind of mistake threw different classes in different modules. For example a non-object input threw `InvalidScientificInputError` in some calculators and `InvalidConfigurationError` in others, and a negative flash guide number threw `InvalidConfigurationError`.
  - *What changed:* one rule (`docs/API_STYLE.md` "Error classes"). A wrong shape is an `InvalidConfigurationError`: a non-object or non-array, a missing sub-object, an unknown field, an unknown kind, mode, policy or version string, or a malformed identifier. A bad number in a calculation is an `InvalidScientificInputError`. Defects inside a versioned record or options object stay configuration errors. About 190 throw sites moved from `InvalidScientificInputError` to `InvalidConfigurationError`. The scalar flash (`calculateFlashGuideNumber`, `calculateFlashPowerForDistance`, `resolveTtlFlashExposure` numbers), shutter-angle and video (`calculateShutterAngleExposureSeconds`, `calculateShutterAngleFromExposureSeconds`, `assessShutterAngleRule`, `resolveVideoFrameSequence` numbers), `calculateHighlightPriorityPlacementSignal` and `calculatePhotonEnergyFromWavelength` wavelength checks moved the other way. Internal seed-derivation errors are `InvalidScientificInputError` instead of a plain `RangeError`. Messages and `code` fields are unchanged. `test/error-class-consistency.test.ts` scans the source for violations.
  - *Effect:* `instanceof` checks and `code` comparisons on these errors can change. `InvalidScientificInputError` still extends `RangeError` and `InvalidConfigurationError` still extends `TypeError`.
  - *Migration:* catch both domain classes, or branch on `error.code`: `INVALID_CONFIGURATION` means fix the shape or field names, `INVALID_SCIENTIFIC_INPUT` means fix the value.
- **Spectral channel binding format v2 (#276, #282, #293).**
  - `SENSOR_SPECTRAL_RESPONSE_CHANNEL_BINDING_FORMAT` is `photivra-spectral-channel-response-canonical-json-v2` (sorted-key JSON of the parsed channel).
  - v1 bindings from 1.5.0 and earlier are rejected with a version error.
  - *Migration:* recompute the quadrature and reduction with 2.0.0.
- **Print JPEG schema 0.2.0 and baseline JPEG encoder v2 (#274, #278, #298).**
  - Print JPEG output gains `encoderId`.
  - IFD0 always carries XResolution/YResolution/ResolutionUnit (72 dpi when `pixelsPerInch` is omitted — the Exif 2.32 value for unknown resolution) and YCbCrPositioning.
  - The Exif IFD adds ExifVersion `"0232"`, FlashpixVersion and ComponentsConfiguration. The paired-export JPEG gets the same tags.
  - `EXPORT_JPEG_ENCODER_ID` is `photivra-baseline-jpeg-444-v2`: correctly rounded DCT cosines and half-away-from-zero quantization. Bytes differ from 1.x only where a coefficient sat within about one ulp of a half-integer, and are now identical across V8 and JavaScriptCore.
  - `maximumProviderReads` now caps exactly ⌈crop height/32⌉ × ⌈crop width/256⌉ crop-aligned strip reads, and fails before the first read when the cap is too small.
  - *Migration:* treat JFIF units = 0, or the absence of `pixelsPerInch` in the XMP plan, as "no physical size"; size the read budget by the new formula.
- **POC API 1.0.0 (#276, #282, #293).** (POC = the proof-of-concept `simulatePocCamera()` contract.)
  - `POC_SIMULATION_API_VERSION` is **1.0.0**. `simulatePocCamera()` values change through depth of field, crop and shake pitch.
  - The repository-only POC transport (not a package export) now returns: 400 for out-of-range aperture/focus and malformed JSON (fixed message); 413 `PAYLOAD_TOO_LARGE`; 422 `SIMULATION_RESULT_OUT_OF_RANGE` for non-finite results; 500 `INTERNAL_ERROR` with a fixed message; and a bodiless 204 preflight.
  - *Migration:* handle 413, 422 and 500 as well as 400.
- **Package contents (#293).**
  - The manifest has no `prepare` or other install scripts. Git installs need `npm ci && npm run build`; contributors run `npm run hooks:install`.
  - No longer shipped: declaration maps; docs other than USAGE, API_REFERENCE, QUICK_START, `api/` and examples; and the unreachable `browser-native-reference-*` and `schema/{camera,scene}.js` modules.
  - *Migration:* read the other guides in the repository.

**Colorimetry: third-party coefficients removed (owner decision, 2026-10-17)**

- **Own CIE 1931 colour-matching-function fit replaces the Wyman et al. (2013) coefficients.**
  - *Why:* the Wyman, Sloan & Shirley paper is CC BY-ND. The owner decided to remove third-party numbers with any licence question.
  - *What changed:* `estimateCie1931ColorMatchingFunctions` uses coefficients the engine fitted itself to the CIE 1931 2° data (same kind of model: a sum of piecewise Gaussians). The CMF source kind `"wyman-2013-cie-1931-multi-lobe-fit"` is now `"analytic-cie-1931-multi-lobe-fit"`, and `WYMAN_2013_CMF_DOMAIN_NANOMETERS` is now `ANALYTIC_CIE_1931_CMF_DOMAIN_NANOMETERS` (still 360–830 nm). The provenance model is `cie-xyz-spectral-integration-analytic-cmf`, and `COLORIMETRY_MODEL_VERSION` is 2.0.0. The fit is still an approximation, slightly closer to the CIE data (maximum error 0.0122/0.00733/0.0221 for x̄/ȳ/z̄, was 0.0140/0.00800/0.0222; see `docs/COLORIMETRY.md`).
  - *Effect:* colour outputs change slightly. Illuminant A integrates to xy (0.4480, 0.4074), was (0.4463, 0.4087). `simulateCapture()` RAW codes move by up to about 0.5 % (mean +1 to +5 codes), so its pinned output digests changed.
  - *Migration:* replace the old kind and constant names. Re-render anything that must match 2.0.0 colour exactly.
- **Planckian locus computed from Planck's law; the Kim et al. (2002) spline is removed.**
  - *Why:* the cubic-spline coefficients come from Kang et al. (2002), which is also claimed in a (lapsed) patent. The owner decided to remove them.
  - *What changed:* the locus is the chromaticity of Planck's law integrated against the engine's analytic CMFs on 1 nm nodes, 1000–100000 K. The locus kind `"kim-2002-cubic-spline"` is now `"planck-analytic-cmf"`, the default of `resolveColorTemperatureWhiteBalance`. `KIM_2002_PLANCKIAN_LOCUS_RANGE_KELVIN` (1667–25000 K) is now `PLANCKIAN_LOCUS_RANGE_KELVIN` (1000–100000 K). `estimatePlanckianLocusChromaticity` keeps its name and uses the new locus. Resolved white-balance states record `planckianLocusModel: "planck-analytic-cmf"`, and states with `"kim-2002-cubic-spline"` are rejected.
  - *Effect:* locus points move by up to 7.0e-4 in CIE 1960 uv from 2000 to 25000 K (1.4e-3 at 1667 K). The CCT of the daylight-locus point at 6504 K becomes 6516.6 K (was 6500.0 K), and Kelvin white-balance gains change by up to 0.5 %. A CCT/Duv search costs about 0.03 ms (0.02 ms with the spline; see Performance).
  - *Migration:* replace `{ kind: "kim-2002-cubic-spline" }` with `{ kind: "planck-analytic-cmf" }` (or omit it for the default) and the range constant name. Re-resolve stored Kelvin/tint white-balance states. For a locus from tabulated CIE CMFs, use `{ kind: "planck-integration", colorMatchingFunctions, quadratureNodes }`.
- **CIE94: the `cie94-textiles` preset is removed; callers pass their own factors.**
  - *Why:* the textiles weights trace only to secondary web pages, not to a free primary source. The primary, CIE 116-1995, is not free.
  - *What changed:* the formulas `"cie94-graphic-arts"` and `"cie94-textiles"` are replaced by one formula, `"cie94"`. By default it uses the formula's published reference conditions (k_L = k_C = k_H = 1, K₁ = 0.045, K₂ = 0.015, the old graphic-arts values). A new option, `cie94Factors: { lightness, chroma, hue, k1, k2 }` (type `Cie94ParametricFactors`), sets all five factors. It is validated and rejects unknown fields.
  - *Effect:* the old formula names are rejected. Default results equal the old `"cie94-graphic-arts"` results. The result's `formula` and method id are now `"cie94"` and `"color-difference-cie94"`.
  - *Migration:* replace `"cie94-graphic-arts"` with `"cie94"`. For textiles or other conditions, pass the factors explicitly from a source you have checked: `{ formula: "cie94", cie94Factors: { lightness, chroma, hue, k1, k2 } }`.

### Added

- **`simulateCapture()` (#300).** A full capture from a few options.
  - Returns the image, packed RAW, the executed request and plan, provenance, and an `assumptions` list naming every default.
  - Exposure modes: manual, aperture-priority, shutter-priority and program.
  - White balance: by scene illuminant, auto, none, Kelvin/tint, or gains.
  - Output: `srgb-8`, `srgb-16` or `jpeg`.
  - Procedural chart presets (uniform, slanted edge, Siemens star, step wedge, grey ramp, checkerboard, point grid, caller-spectrum patches) with `resolveChartScene` and helpers.
  - `SIMULATE_CAPTURE_FACADE_VERSION` 1.0.0; `docs/QUICK_START.md` (shipped) and `docs/examples/simulate-capture.mjs`.
- **`simulateCapture()` uses the 2.0 features (#306, #307).** All opt-in. Without the new options, the 1.0 facade output is byte-identical at the same illuminance (the default illuminance changed; see *Free-source citations* below), apart from the colour-matching-function change under *Breaking changes*. Every choice is listed in `assumptions`.
  - `output.format: "png"` with `colorEncoding` `srgb`, `display-p3` or `rec2020`. The unclipped linear development is converted through CIE XYZ, clipped once in the target gamut, and signalled with cICP. The `rec2100-pq` and `rec2100-hlg` encodings prepared for 2.0 were removed before release: pQ and HLG (ITU-R BT.2100) are not shipped in 2.0 because their patent holders offer only licence-on-request declarations (owner decision, 2026-10-17; see the patent review in `THIRD_PARTY.md`).
  - Optional `gamutMapping: "perceptual"` (constant CIELAB L* and hue).
  - `output.format: "dng"`.
  - `output.demosaic` (`bilinear`) and `borderHandling` (`margin`, `mirror`).
  - `lens.projection`, `lens.distortion` (radial or Brown–Conrady), `lens.vignetting` and `lens.psf`.
  - `motion.angularVelocityRadPerSec` and `motion.shutter: "rolling"`.
- **Native RAW DNG (#307).** `serializeNativeRawDng()` writes a lossless 16-bit CFA (colour filter array) DNG directly from packed native RAW.
  - Tags: per-phase BlackLevel and CFAPattern from the ActiveArea origin; WhiteLevel from the effective saturation code; ActiveArea, DefaultCrop, Orientation, ColorMatrix1, ForwardMatrix1, AsShotNeutral, BaselineExposure and an optional NoiseProfile.
  - It declares no linear master, and counts the saturation flags DNG cannot carry.
  - `NATIVE_RAW_DNG_SCHEMA_VERSION` 1.0.0.
- **Colorimetry (#291).**
  - Analytic CIE 1931 colour-matching functions (the engine's own fit, labelled approximation) or caller-tabulated CMFs; `integrateSpectrumToXyz`.
  - Planck radiance, illuminant A, CIE daylight with caller-supplied basis spectra, the Planckian locus from Planck's law, McCamy CCT, and nearest-locus CCT/Duv with its inverse. (CCT = correlated colour temperature.)
  - Chromatic adaptation: Bradford, CAT16, von Kries-HPE, XYZ scaling, degree of adaptation. CAT02 is not part of 2.0: no free source prints its matrix (owner decision, 2026-10-17). The `"cat02"` transform prepared for 2.0 never ships, in `calculateChromaticAdaptationMatrix` or in `calculateCaptureColorTransform`. CAT16 has a free source, IS&T CIC24 2016 Eq. (15).
  - CIELAB/LCh, and ΔE76, CIE94 and CIEDE2000.
  - `estimateCameraColorMatrix`.
  - RGB colour spaces (sRGB, Rec.709, Display P3, Rec.2020) and sRGB, BT.709 and BT.1886 transfers; gamut mapping. PQ and HLG (ITU-R BT.2100) are not shipped in 2.0 because their patent holders offer only licence-on-request declarations (owner decision, 2026-10-17; see the patent review in `THIRD_PARTY.md`). The PQ/HLG functions and constants prepared for 2.0 (`evaluatePqEotf`, `evaluatePqInverseEotf`, `PQ_CONSTANTS`, `evaluateHlgOetf`, `evaluateHlgInverseOetf`, `HLG_CONSTANTS`, `calculateHlgSystemGamma`, `prepareHlgReferenceDisplay`, `HlgReferenceDisplay`) never ship. `resolveRgbColorSpace("rec2020").sources` lists only ITU-R BT.2020-2.
  - `resolveColorTemperatureWhiteBalance` turns Kelvin + tint into channel gains. `calculateCaptureColorTransform` takes an optional adaptation `transform`.
- **Sensor (#290).**
  - `createIsoGainReadoutRegimes()`: ISO-dependent analog and digital gain, with read noise per conversion gain.
  - Regime fields `adc.digitalGain`, `adc.integralNonLinearity` and `exposureIndexGain`.
  - Opt-in fixed-pattern noise (`parseSensorFixedPatternNoiseProfile`, `calculateSensorFixedPatternSite`, `SENSOR_FIXED_PATTERN_NOISE_MODEL`).
  - A `log-linear-temperature-table` dark-current model.
  - Tier `rollingReadoutTiming` and `fixedPatternNoise` assets.
- **RAW development (#295).**
  - `highlightMode` (`clip` or `reconstruct`) with diagnostics.
  - Tone curves `extended-reinhard-luminance` and `naka-rushton-luminance`.
  - `calculateEffectiveSaturationCode`.
  - DNG ForwardMatrix1, BaselineExposure, NoiseProfile and AnalogBalance.
  - Progress reporting on development and native SDR.
  - `createPhotographicExportPair(input, { signal })`.
- **Optics (#296, #303).**
  - Fisheye and equirectangular projections (`calculateLensProjection*`, and an optional `projectionModel` on field of view).
  - Brown–Conrady distortion and its inverse.
  - Longitudinal chromatic aberration and Cauchy dispersion.
  - Natural and mechanical vignetting.
  - Polygon-pupil Fraunhofer PSF.
  - Zernike/Seidel wavefronts and the Maréchal Strehl ratio.
  - Centroid-aligned and rotational PSF interpolation.
  - A linear polarizer (filter schema 0.2.0).
  - Atmospheric haze.
  - Focus breathing.
  - Geometric mappings gain `brown-conrady` and `projection-remap` transforms (mapping schema 0.2.0). Environment capture accepts an optional `lensFieldMapping`, which the production plan composes.
- **Motion, video and flash (#297).**
  - Electronic rolling-shutter exposure schedules, so skew, partial exposure and flicker banding emerge in image formation.
  - Video frame sequences and shutter-angle helpers.
  - Flash guide number, pre-flash TTL (through-the-lens metering) and high-speed sync (sync schema 0.2.0).
  - The `highlight-priority` metering policy.
- **Export formats (#298).**
  - `parseDngRawImage`: a bounded DNG/TIFF-EP reader (uncompressed and lossless JPEG, 8–16 bit), with `DNG_IMPORT_SCHEMA_VERSION` 1.0.0 and `DNG_IMPORT_LIMITS`.
  - `parseLosslessJpeg` (ITU-T T.81 Annex H).
  - `serializePngImage`: 8/16-bit RGB PNG with sRGB, iCCP or cICP for Display P3 and BT.2020 (sRGB, BT.709 or linear transfer); mDCV/cLLI metadata; deterministic in-house zlib. No PQ or HLG code points.
  - `EXPORT_JPEG_ENCODER_ID`.
  - AVIF and HEIC are not provided.
- **Processing (#302).** All opt-in. See `docs/PROCESSING.md`.
  - Bilinear Bayer demosaic profiles, AHD demosaicing and CFA-plane reconstruction. The Malvar–He–Cutler kernels prepared for 2.0 were removed before release (owner decision, 2026-10-17): Microsoft's US 7,502,505 is in force until about January 25, 2027, and its claim 1 closely matches the method. The `malvar-he-cutler-2004` kernel and the `simulateCapture()` option `output.demosaic: "malvar-he-cutler"` never ship. They may return after the patent expires (about 25 Jan 2027). Bilinear (the default) and AHD are unchanged, and the hash-lock tests confirm the default output is unchanged. See the patent review in `THIRD_PARTY.md`.
  - `borderHandling: "mirror"` for RAW development.
  - Noise-optimal HDR bracket merge, and conversion to float32 linear BT.2020 (`createHdrImageEncodingTask`, `transfer: "linear-float32"` only). Its PQ/HLG modes and their integer-code options were removed before release; the SDR outputs are unchanged, as the hash-lock tests confirm.
  - Reinhard and Durand–Dorsey tone mapping, exposure fusion, focus stacking and known-rotation panoramas.
  - Bilateral and non-local-means denoise, unsharp mask, and an explicitly synthetic film grain.
  - A shared `ProcessingTask` contract.
- **Opt-in WebGPU backend (#304).** See `docs/WEBGPU.md`.
  - `createImageKernelAccelerator()` runs isoplanatic PSF convolution, native capture SDR and packed RAW development as `webgpu-f32`.
  - Results are labelled with a float32 error bound stated in advance, and are never claimed to be bit-identical. The CPU float64 reference stays the default.
  - Also `calculateIrradianceConvolution()` and its plan (schema 0.1.0), `ImageKernelExecutionError`, and the repository-only `npm run test:webgpu`.
- **WebGPU image-formation stages and accuracy contract (#277).** See `docs/WEBGPU.md`.
  - **Accuracy contract:** per-stage a-priori bounds, kept separate from method error, and `composeRelativeErrorBounds()` for chaining linear stages.
  - **Sensor stage:** `simulatePackedSensorRaw()` (schema 0.1.0) is the per-site producer's charge, noise and ADC on typed arrays. It is bit-identical to `calculateNativeRawSite`. `accelerator.simulateSensorRaw()` runs it on `webgpu-f32` with the same seeded noise model (`photivra-native-raw-noise` 0.4.0, MurmurHash3 per-site seeds). The new `exact-except-flagged-sites` label means every unflagged site equals the reference exactly. Flagged sites are listed in `flaggedSiteIndices` and covered by a statistical-equivalence test.
  - **Sensor stage, fixed-pattern noise and extra charge:** `PackedSensorRawInput` takes an optional `fixedPatternNoise` (a `SensorFixedPatternNoiseProfile` and its colour-site origin) and up to 8 `additionalChargeComponents` (Poisson or deterministic). The reference stays bit-identical to the per-site engine functions with both (tested), and `webgpu-f32` keeps the `exact-except-flagged-sites` guarantee (0 differing sites on SwiftShader).
  - **Luminance tone curves on the GPU:** `renderNativeCaptureSdr` and `developNativeRaw` on `webgpu-f32` now run `extended-reinhard-luminance` and `naka-rushton-luminance` (exponent ≥ 1) instead of rejecting them. Their code bound is a running bound: a fixed per-sample formula evaluated from the kernel's own values, and the run's largest value is reported. On SwiftShader every code was within 1 of the reference.
  - **Kernels from lens PSFs:** `resolveLensPsfConvolutionKernels()` (schema 0.1.0) resolves a `LensSampledPsfProfile` at each patch centre with `resolveLensSampledPsf` and maps its taps onto site displacements with the per-site quadrature's own inverse support. Equal pitches give exact site sampling; other pitches use bilinear splatting, a labelled approximation that is the adjoint of bilinear interpolation (tested). Several wavelengths give a weighted spectral kernel.
  - **Scene radiance on the GPU:** `calculateChartRadianceBatch()` (schema 0.1.0) answers many radiance or spectral-integral queries on the engine's chart presets, using the planar provider's own `radianceAt`. `accelerator.evaluateChartRadiance()` runs it on `webgpu-f32`: the GPU classifies materials with a-priori bounds, flagged points are recomputed on the host, and every value is the reference rounded once to float32 (relative 2^-24; 0 misclassified points on SwiftShader). `mapEnvironmentDirectionsToChartPoints()` converts environment-direction queries.
  - **Per-fixture rollout:** for every built-in chart preset, the GPU image-formation path's method error against the per-site engine is measured on sampled tiles and pinned in tests (`docs/WEBGPU.md`, "Per-fixture rollout"). With a synthetic, strongly field-varying PSF and 8-site patches it is 1.2–2.5 % of the tile peak, and larger at sub-site detail (16.8 % at a point-grid disk edge with 2 µm PSF samples; 24.9 % at the Siemens-star centre, where both paths alias). These are accuracy numbers, not speed.
  - **Exposure and motion:** `calculateTemporalExposureSum()` (schema 0.1.0) is a weighted sum of shifted frames with per-row weights, for rolling or global readout. Sub-site shifts use bilinear interpolation, a labelled approximation. `accelerator.sumTemporalExposure()` runs it on `webgpu-f32` with a relative bound.
  - **Timings:** the repository-only `npm run bench:webgpu` times the stages at 6–24 MP on the owner's hardware. No hardware timings have been measured yet.
- **Optical-stage reuse (#288).** `NativeEnvironmentRawInput.opticalStage` returns an opaque optical stage. `createNativeEnvironmentSensorStageTask()` then re-runs only dark charge, capacity, noise and ADC after edits that come after the optics. Optical changes are refused.
- **Opt-in parallel native environment RAW (#275).** `calculateNativeRawRowBands()` splits a capture into row bands, `createNativeEnvironmentRawPartitionTask()` runs one band (for example in a Web Worker or Node worker thread, with the caller's own provider), and `composeNativeEnvironmentRawPartitions()` joins the posted partitions. The merged output is byte-identical to `createNativeEnvironmentRawTask()` for the same input (`test/native-environment-partitions.test.ts`). No worker code is bundled. Measured with `scripts/benchmark-native-environment-workers.mjs` on a shared 4-vCPU host, 48×48 sampled PSF: 1.53 s on one thread, 0.66 s with 4 workers (2.3×); cheap default-optics sites gain much less.
- **Batched light sampling (#275).** Optional `NativeEnvironmentRawProvider.evaluateRadianceBatch(queries, signal)` receives every radiance query of a tile (`NativeEnvironmentRadianceQuery`, in per-query callback order) and returns the results in order, synchronously or as a promise. Results are validated like per-query results, so the output is identical for the same results (`test/native-environment-batch.test.ts`). It is meant for GPU, WebAssembly or cross-thread providers; with a JavaScript provider on the CPU it is about as fast as per-query callbacks (48×48: default 0.29 → 0.27 s, 4 pupil rays 2.11 → 2.43 s).
- **Smaller additions.**
  - `PrintJpegInput.pixelsPerInch` (1–65535; #278).
  - The `LensComplexPupilPsf.sampling` field (#284).
  - `SENSOR_SPECTRAL_RESPONSE_CHANNEL_BINDING_FORMAT` (#293).
  - A `"default"` export condition so Node ≥ 22.12 can `require()` the package; the `./package.json` export; JS source maps with inline sources; and declarations that type-check with `lib: ["es2022"]` alone (#293).

### Free-source citations (owner decisions)

The engine now relies on free-to-read sources wherever one was found. See the citation audit in the 2.0.0 release record.

- **Numeric change: `simulateCapture()` exposure anchor.**
  - *What changed:* the anchor no longer uses the reflected-light meter constant K = 12.5 cd·s/m² of a paid standard. It uses CIPA DC-004-2020 (free): standard output sensitivity S = 10/H and the camera equation H = 0.65·L·t/N², with an 18 % grey as the reference. This is equivalent to K = 10/0.65 ≈ 15.38 cd·s/m².
  - *Effect:* `SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX` changes from π·12.5·64·125/18 ≈ 17 453.29 lux to π·10·64·125/(0.65·100·0.18) = π·80 000/11.7 ≈ 21 480.98 lux, a factor of 10/(0.65·12.5) ≈ 1.231 (about 0.30 EV). The metered reference luminance for f/8, 1/125 s, ISO 100 changes from 1000 cd/m² to 80 000/65 ≈ 1230.77 cd/m², so `exposure.meteredSceneLuminanceCdPerSquareMeter` of the default grey card changes by the same factor. Default captures are brighter: the green RAW level of the 18 % grey card goes from about 10.6 % to about 13.1 % of RAW white. Auto-exposure modes resolve N²/t = 0.65·L·S/10 instead of L·S/12.5. The `illuminanceLux` and `exposure.referenceExposure` assumption texts change.
  - *Unchanged:* with `illuminanceLux` set to the old default, every 1.0 facade output (samples, RAW codes, JPEG, request, scene digest) is byte-identical; a test checks that, and pins the new default digests.
  - *Migration:* pass `illuminanceLux: Math.PI * 12.5 * 64 * 125 / 18` to reproduce earlier captures.
- **Text-only output change: runtime strings.** No number changes.
  - Provenance and assumption strings that named paid standards now name free sources: RGB colour-space `sources` (`srgb`: "W3C CSS Color Module Level 4 srgb"; `display-p3`: "W3C CSS Color Module Level 4 display-p3 (…)", "ITU-T H.273 ColourPrimaries 12"), the matrix-derivation assumption of `resolveRgbColorSpace`, the CIELAB assumptions, the daylight-locus assumption, the CCT Duv-sign assumption (now the engine's own convention), the HDR encoding assumptions (ITU-R BT.2100 PQ; BT.2020 matrices), the facade's PNG colour-encoding texts, and the illuminant A scene description.
  - The `calculateCorrelatedColorTemperature` error for |Duv| > 0.05 is reworded.
  - Limitation and error strings that used internal ticket numbers as model names (#12, #14, #85, #110) now name the model: exposure-window model, sensor pipeline, scene-radiance provider, and the scene-radiance-to-sensor-irradiance optical bridge (stabilization, extended-object projection, flash, temporal metering, RAW frame and production image-formation plan).
  - *Migration:* code that matches these strings exactly must update them. Result model ids are unchanged.
- **Documentation and tests.** The flash guide-number relations are derived in full from the inverse-square law and the camera equation (the guide-number measurement standard is no longer cited). Tristimulus integration cites Wyman, Sloan & Shirley (2013), Eq. 1; Planck's law cites the BIPM kelvin *mise en pratique*. CIE94 cites a free secondary source and is checked by closed-form cases computed in the test. The RGB↔XYZ derivation is written out in `docs/COLORIMETRY.md`, and a new test shows the engine's matrices equal the W3C CSS Color 4 matrices within 1e-12. The Duv sign (positive above the Planckian locus) cites Ohno's free CORM 2011 slides (slide 5); the engine documents it, and a new test checks that a greenish light has a positive Duv. The ISO-brightness test uses the DC-004 mid-grey reference (0.18 of white) instead of a paid saturation-speed ratio.
- **Documentation: CAT16 matrix source (owner decision, 2026-10-17).** The CAT16 cone matrix now cites the free IS&T paper of Li et al. (2016), "A Revision of CIECAM02 and its CAT and UCS", CIC24, Eq. (15), doi:10.2352/ISSN.2169-2629.2017.32.208; its nine coefficients were checked against the engine. That paper does not print the CAT02 matrix, so CAT02 keeps its earlier sources. The patent review in `THIRD_PARTY.md` records that no patent was found claiming either matrix. Comments and docs only.

### Fixed

- Captures, packed RAW and export hashes (`simulationHash`, DNG/JPEG SHA-256) are now identical across the V8 and JavaScriptCore JavaScript engines. The POC hash corpus passes on every engine without overrides (#293).
- ISO now changes RAW and developed brightness. Base-ISO white sits at ADC full scale, instead of code 20512 of 65535 (#290).
- ADC round-half-up is exact (0.49999999999999994 rounds to 0). Poisson draws for means ≥ 1e9 have the correct variance (#290).
- RAW development (#295) fixes:
  - double white balance;
  - AsShotNeutral written as the camera white squared;
  - coloured clipped highlights;
  - ignored saturation flags;
  - WhiteLevel written as the ADC maximum;
  - BlackLevel and CFA phase taken from the absolute origin instead of the ActiveArea;
  - an unclear error when Web Crypto is missing.
- Print and paired-export JPEG Exif carry every tag that Exif 2.32 makes mandatory for compressed images (#278, #298).
- `Math.floor(x + 0.5)` rounding is replaced by exact rounding in SDR rendering, linear encoding and Print JPEG sRGB codes (#295, #298).
- Auto ISO with Shutter or Aperture Priority picks a grid value equal to the ideal within `settingEquals` tolerance. Grid end points within tolerance are no longer reported as clamped (#272, #281).
- Valid exit-pupil declarations are no longer rejected, and packaged docs no longer link to unshipped files (#293).
- The illumination-vignetting solver for interior extremes uses a stable scaled quadratic (#296).
- `resolveLensSampledPsf` no longer rejects an interpolated pupil throughput that floating-point weights lift a few ulps above 1 (#307).
- `simulateCapture()` validates pupil sampling (4–64 angular samples, at most 256 rays) before doing any work (#306).
- Colour, haze, projection and PNG inputs reject unknown fields in nested records too, as the 2.0.0 strict-records rule requires: XYZ and white points (`x`, `y`, `z` only), xy chromaticities (`x`, `y` only), CIELAB/LCh colours, CIEDE2000 `parametricFactors` (now as strict as `cie94Factors`), each Planckian `locus` kind, `wavelengthRangeNanometers`, the `createCieDaylightSpectrum` basis, RGB `primaries`, the haze `extinction` model, lens-projection `direction` and `imagePointMm`, and the PNG `colourEncoding`, `masteringDisplay` and `contentLightLevel`. Before, a typo such as `extinction.rayleighExponet` silently fell back to the default Rayleigh exponent 4. *Migration:* remove extra fields; a luminance `Y` beside an xy chromaticity is no longer accepted.
- `calculateChromaticityFromCorrelatedColorTemperature` (and so `resolveColorTemperatureWhiteBalance`) throws `InvalidScientificInputError` when CCT + Duv lands outside x ≥ 0, y > 0, x + y ≤ 1. 2000 K with Duv +0.02 used to return x + y = 1.0595, a chromaticity the engine itself rejects as input, and a Kelvin white-balance state built on it.
- `serializePngImage` no longer accepts `Object.prototype` names as code points: `primaries: "constructor"`, `transfer: "toString"` or `renderingIntent: "toString"` wrote reserved cICP or sRGB bytes. The lookups are now maps, and unknown `colourEncoding` fields are rejected.
- `createHdrBracketMergeTask` never returns NaN or Infinity. Exposure times below 1 ns are rejected (at 10⁻¹⁷⁰ s, t² underflowed and the weights became 0/0; see `docs/PROCESSING.md` for why 1 ns keeps every quantity finite in float32), and a merge that still gives a non-finite or out-of-float32 value fails with `InvalidScientificInputError`.
- `mapEnvironmentDirectionsToChartPoints` rejects directions that map to a non-finite chart point, such as the grazing (1, 0, −1e-320), which gave −Infinity and NaN, or a non-finite component.
- `highlight-weighted` metering is now documented as a highlight-emphasis mean: about 0.5–0.8 EV darker than uniform metering in scenes with bright accents. Its behaviour is unchanged. The new `highlight-priority` policy is the one that places highlights (#297).
- WebGPU accelerator (#277) fixes. GPU output values are unchanged:
  - The `webgpu-f32` error bounds of the convolution and the temporal sum now cover weights below 2^-126. The host can round such a weight to zero and a GPU can flush it, so with samples up to 2^100 the reported bound could be exceeded (for example by 2^-60 against a bound near 2^-125). The bound gains a term 2·S_max × (the at-risk weights), which is 0 when no weight is that small (docs/WEBGPU.md).
  - Convolution readback buffers are released after each band. Before, every band's readback stayed alive until the end, so GPU memory grew with the image instead of the band.
  - A WebGPU device that arrives after acquisition was aborted is now destroyed instead of leaking.

### Performance

Unless marked otherwise, output is bit-identical to the code before the change, checked by committed hash and frozen-oracle tests. Timings come from the source PRs, on small fixtures, on a shared 4-vCPU Linux host under Node 24. They are indicative only.

- **Native environment RAW (#285, #292, #294).**
  - Changes: one finite-number pre-walk; a cached parse of engine-owned PSF profiles; one PSF parse per event instead of per site; no per-site serialization of shared state; site plans that keep only the frozen request and image-plane point.
  - Native acquisition is 2.2–3.0× faster on the 2×2 workloads.
  - With a large sampled PSF, CPU per site falls by about 30 %, and a site plan shrinks from about 25 to 8 MB.
  - The native RAW identity walk is about 3× faster (73 → 46 µs per site).
- **Native SDR** uses a typed-array kernel (about 10–13× faster; 24 MP 8-bit 33.9 → 3.3 s) and an exact LUT-based 8-bit sRGB quantization (#286, #295).
- **RAW development** uses a typed kernel (#295):
  - 10–15× faster at 1 MP; 24 MP in 3.8–4.6 s instead of 33–42 s;
  - creation is O(metadata) (220 → 4 ms at 24 MP);
  - 24 MP peak array memory falls from 389 to 229 MiB.

  The output changes listed under Breaking changes are intentional and separate from this speed-up.
- **JPEG (#286, #298):**
  - an exact-order faster DCT and entropy coder (about 1.6–2.2×; #286);
  - a growing output buffer instead of a zero-filled full budget (a 384-byte JPEG at a 256 MB budget: 256 MB / ~130 ms → 64 KiB / 0.02 ms);
  - Print JPEG strip reads with an sRGB LUT (24 MP 1:1: 375,000 → 3,000 provider reads; 4 MP → 0.25 MP: 1,245 → 339 ms) (#298).
- **Stabilization evaluation** is linear-time (16,000 samples: 3,100 → 222 ms). Native acquisition and development yield to the host about every 8 ms, now also between sites inside a tile, so `cancel()` takes effect after about one site (#287, #292).
- **Optional optical-stage reuse** re-runs the sensor stage 5.0–11.4× faster than a full recompute (#288).
- **Lean per-site executor (#305).** Native environment RAW (and so `simulateCapture()`) runs sites that match a self-verified template through a lean per-site executor.
  - Same maths, same floating-point order, but without redundant per-site re-validation and result envelopes.
  - Every data-dependent check remains, and falls back to the full engine functions. RAW, callbacks and errors are byte-identical.
  - `simulateCapture()` 64×64: 6.0 → 0.87 s CPU; 128×128: 20.6 → 2.2 s. RAW stage 0.95 → 0.12 ms per site.
  - Sampled-PSF and lens-mapped sites are lean-eligible too (#275 follow-up). Their kernels, tap points and mapped queries come from the full chain's own functions; the PSF quadrature's checks still run after each instant's callbacks, and the full quadrature decides when one fails. Output is byte-identical (`test/native-environment-lean.test.ts`). `simulateCapture()` 48×48 (`scripts/benchmark-native-environment.mjs`): 3×3 sampled PSF 11.9 → 1.96 s (6.1×); radial distortion 2.63 → 0.59 s (4.4×).
  - Pupil-ray sites compute their rays with `calculateSensorApertureRays`' own core after one validation per template, and copy each ray for the provider key by key instead of with `structuredClone` (#275). Byte-identical (`test/aperture-ray-fast-path.test.ts`, lean tests). `simulateCapture()` 48×48 with 1×4 pupil rays: 2.19 → 1.26 s (1.7×).
  - All #275 follow-ups together, same benchmark and host, main before vs after: sampled PSF 11.2 → 1.60 s (7.0×), radial distortion 2.66 → 0.46 s (5.7×), 1×4 pupil rays 2.32 → 1.15 s (2.0×), default optics unchanged within noise (0.33 vs 0.34 s); RAW and image SHA-256 identical in every case.
- **CCT/Duv search by Newton root-find (owner approval 2026-10-17).** *Not bit-identical.*
  - Changes: `calculateCorrelatedColorTemperature` solves d(uv distance²)/dT = 0 with the analytic temperature derivative of Planck's law (safeguarded Newton with bisection, bracketed by the cached coarse scan, converged to 1e-10 of T), instead of a golden-section search. Duv and the inverse use the analytic locus normal instead of finite differences.
  - Speed (`scripts/benchmark-planckian-locus.mjs`, medians, same 4-vCPU host): CCT/Duv 366 → 31.3 µs (11.7×); chromaticity from CCT + Duv 22.5 → 16.5 µs; Kelvin white balance 21.3 → 18.6 µs.
  - Results: CCT now agrees with a 50-digit reference root to 3.3e-12 relative. The old search was off by up to 6.0e-3 K below 25000 K and 0.089 K (1.2e-6 relative) above, so CCT changes by those amounts. Duv changes by at most 8.3e-16. The inverse moves xy by at most 9.3e-10 (1.4e-7 at exactly 1000 or 100000 K); at Duv = 0 it is unchanged. No pinned digest changed. Points whose nearest locus point lies just inside a range limit now resolve instead of failing.
- **PNG encoder.** Bit-reversed fixed-Huffman codes, length and distance codes precomputed once (instead of reversing every symbol bit by bit), a preallocated output buffer, a rolling LZ77 hash, a one-byte check at the current best length before comparing a chain candidate, and one specialised loop per PNG filter (the adaptive heuristic sums costs with a lookup table instead of writing five candidate rows through a closure). Output bytes are unchanged: a SHA-256 over 789 cases (60 images, 8- and 16-bit, every filter and both compression modes, 30 raw zlib streams, 1200×900 images and an iCCP profile) matched before and after, and `test/png-encoder.test.ts` now pins a digest. 4000×3000 RGB, medians of 5 runs, before and after run back to back on the same shared 4-vCPU host, Node 24: 16-bit noise, default settings, 9.8 → 6.1 s; 8-bit gradient 3.3 → 1.0 s; 16-bit noise without filtering 6.8 → 4.3 s; 16-bit noise, stored 4.4 → 2.0 s. On noise the remaining time is mostly the LZ77 match search, which byte identity keeps as it is.
- **WebGPU:** no GPU speed-up is claimed for the WebGPU backend. On the software adapter it was slower than the CPU (#304).

### Tests and tooling

- Coverage rose from 92.4 % to 94.4 % of lines and from 88.7 % to 91.0 % of branches. `npm run coverage` scales timeouts under V8 coverage (#299).
- New independent checks (#299): spot values beside the bit-identity hash locks, an independent camera-equation RAW oracle, a non-linear temporal-quadrature convergence test, and table-driven rejection tests for public parsers.
- An informational, non-blocking macOS CI job runs the hash-lock tests (#299). `npm run test:webgpu` runs conformance on a real GPU (#304). It now also covers the sensor stage, the temporal sum, luminance tone curves, chart radiance and the per-fixture rollout (89 tests in three files) and passes on SwiftShader (#277). `npm run test:webgpu:hardware` and `npm run bench:webgpu:hardware` run them on a hardware adapter on Linux, macOS or Windows and refuse a software adapter; they have not been run on hardware.
- Benchmark scripts that import `dist/` fail when the build is missing or stale (#292).
- `NUMERICAL_CORRECTNESS.md` documents the cross-engine determinism policy and the test hash locks; `API_STYLE.md` documents naming conventions (#293, #299).
- Plain-language rewrite of the source comments and docs: shorter sentences, jargon defined at first use, internal ticket chatter removed. Comments and prose only; the comment-stripped build is identical (#309–#312).
- For AI agents: `llms.txt` and `docs/AGENT_GUIDE.md` ship in the package, and the API reference opens with a task-to-function index that its generator checks against the root exports (#313).
- No CIE table values in tests (owner decision, 2026-10-17). The CMF, illuminant A, daylight and locus tests now check internal consistency, normalization, round trips and values computed from Planck's law and the daylight formula. The CIEDE2000 tests replace the Sharma et al. (2005) published pairs, whose data file carries no licence, with closed-form special cases computed from the formula. `scripts/fit-cie-1931-cmf.mjs` reproduces the CMF fit (it downloads the CIE table at fit time only), and `scripts/benchmark-planckian-locus.mjs` times the locus functions.
- No unclear-licence test inputs (owner rule, 2026-10-17): the MurmurHash3 vectors copied from a Stack Overflow answer are replaced by the test's own reimplementation of SMHasher's verification procedure (SMHasher is MIT-licensed; no code copied; the expected value 0xB0F57EE3 is a published fact); the Bradford test follows ICC.1:2010 Annex E with computed D65/D50 whites instead of a secondary website's matrix; the CIE94 worked values from the colour-science documentation are replaced by closed-form cases; the longitudinal-chromatic-aberration test uses a synthetic glass (n_d = 1.5, V_d = 60) instead of catalogue values.
- `docs/licenses/adobe-dng-patent-license-record.txt` records where the Adobe DNG patent licence was read (URL, date, page SHA-256), its exact required notice and a summary. It is not a copy of the licence: Adobe's Terms of Use do not clearly allow copying its website text.
- Every test and helper file in `test/` now starts with `// SPDX-License-Identifier: Apache-2.0` (117 files that lacked it; all are the project's own work).
- New CI job `licence scan`: ScanCode Toolkit 32.5.0 (hash-pinned in `.github/scancode-requirements.txt`) scans the repository, and `scripts/check-scancode-policy.mjs` fails on a non-Apache-2.0 licence finding or a foreign copyright holder unless the file and finding are on its reviewed allowlist. See `docs/DEVELOPERS.md`. The pull-request template now asks for the source, licence and patent check of new algorithms, constant sets, datasets and file formats.
- `AGENTS.md` is reset to a short standard file with three rules: evidence-based changes, free-to-use sources only, and owner approval for anything that goes to production (#308, #313).

## 1.5.0 — published October 7, 2026

See [the 1.5.0 release record](https://github.com/Photivra/photivra/blob/main/docs/RELEASE_1_5_0.md) for the candidate review.

- Add optional `NativeRawInput.tileWidth` (1–256 native sites) so bounded native RAW acquisition can use smaller execution chunks while preserving the existing 256-site default, physical sampling, absolute CFA coordinates, deterministic noise seeds, shutter timing, output payload and existing whole-event/resource caps.
- Preserve the exact acquisition tile width through same-RAW validation and development. Reject invalid widths, inconsistent tile counts and stale plans instead of silently rebuilding a default-width plan.
- Keep the separable ideal-emission experiment repository-only under `src/api/`; it is not part of the npm/root API and establishes no production Focus, source-separability, full-native or device-readiness claim. Dense-pupil qualification remains tracked separately in #224.
- Include the test-only Node 24 timeout stabilization from #229; it changes no engine behavior or scientific assertions.
- Include #232's repository-only independent photon/electron qualification tests and complete 2×2 resource pilots. These establish bounded checkpoint evidence, not full-native Focus, depth/refinement or device qualification; no experimental root export or resource-limit change.

## 1.4.0 — published October 4, 2026

See [the 1.4.0 release record](https://github.com/Photivra/photivra/blob/main/docs/RELEASE_1_4_0.md) for the candidate review.

- Add standalone evidence-bound ideal circular pupil rays and optional origin-aware bounded photo/RAW evaluation. Reuse shared focus and camera rotation, average normalized pupil irradiances before the existing sensor pipeline, and retain exact-once working-f-number throughput. Reject simultaneous sampled PSF, missing callbacks, invalid geometry and excessive budgets before provider work. Production depth/visibility composition remains unsupported. See `docs/SENSOR_APERTURE_RAYS.md`.

- Add separate metadata-only packed native RAW, physical source-to-RAW and same-RAW reconstruction/SDR tasks with explicit 24 MP admission, bounded tiles, absolute CFA/seed identities, cancellation and single-transfer ownership. Preserve the reference RAW caps and scalar mathematics.
- Add bounded post-SDR Print crop/area downsampling and original baseline JPEG encoding with an original sRGB ICC profile. Explicit source hashes remain caller declarations; platform save/share, printer appearance and physical device acceptance are separate.
- Record complete one-megapixel constructed RAW → SDR → downsampled JPEG execution and independently decoded JPEG/ICC/area-filter controls. See [native RAW and Print contracts](https://github.com/Photivra/photivra/blob/main/docs/NATIVE_RAW_AND_PRINT.md).

## 1.3.0 — published October 4, 2026

- Add evidence-bound radial illumination throughput to bounded environment photo/RAW execution, validating every inverse PSF tap before provider callbacks and applying attenuation once in physical sensor coordinates. Production composition requires explicit vignetting fidelity. Preserve unity arithmetic, resource limits and unverified transport flags.

## 1.2.0 — published October 3, 2026

- Add metadata-only external RGB tile execution with explicit 24 MP/resource limits, whole-capture identity, unchanged reference arithmetic, cancellation/disposal and single-transfer output ownership. See `docs/NATIVE_CAPTURE_SDR.md`; review/version/publication and native-producer/device qualification remain separate.
- Add bounded paired linear processing differences and repeat-capture temporal statistics, plus a restricted MIT-licensed castleCSF static neutral Gabor contrast reference. Independently test arithmetic and owned public PSF, photocharge, JPEG, depth/defocus and motion paths. Full #196 source/backend/perception/product acceptance remains blocked; see `docs/PRINT_195_196_REVIEW.md`.
- Add explicit complex-pupil propagation distance and result binding (model 1.1.0), preserving omitted-input nominal focal-plane kernel values. Finite-focus callers can pass the shared resolved image distance without implying qualified exit-pupil geometry.
- Audit #195 planning acceptance across print/viewing scales, retained crops, invalid-input recovery and exact integer alternatives.

## 1.1.0 — published October 3, 2026 (historical preparation notes)

- Add a bounded regional coherent-sinusoid diagnostic and explicit stage/region/source identity. Independently validate Fourier modulation and angular projection using owned analytic references; preserve acquisition, system MTF, noise/artifact/perception qualification as unassessed. Full #196 acceptance remains blocked. See `docs/PRINT_DETAIL_ASSESSMENT.md` and `docs/PRINT_DETAIL_VALIDATION.md`.

- Add native-only Print planning and conditional size queries. Independent viewing distance and explicit pixel/stroke/line-pair conventions derive density; advanced manual PPI creates a distinct plan. Preserve confirmed native crop/orientation and exact-ratio integer output, reconcile declared lab constraints, and return no recommendation for upscale or conflicts. Captured detail and delivery remain unassessed. See `docs/PRINT_PLANNING.md`.
- Align package/root creator identity at 1.1.0 for this additive release. Existing APIs, archived records, fixtures and all independent schema/POC/production-plan versions remain unchanged. See `docs/RELEASE_1_1_0.md`.

## 1.0.1 — published October 2, 2026

- Expand Node support to maintained 22/24 LTS plus 26 Current, with patched-major CI and the existing 22.13 minimum job, reviewed lifecycle windows and updated tooling guidance. Keep Node 24 build/typings baseline.
- Align the npm package and `ENGINE_API_VERSION` at 1.0.1 and enforce equality in source metadata, generated references and isolated packed consumers. Schema/model/POC/plan versions and scientific calculations are unchanged. New capture/plan creator identities and hashes can differ; archived records and acceptance artifacts retain their original versions. See `docs/RELEASE_1_0_1.md`.

## 1.0.0 — published October 2, 2026

- Prepare the stable public distribution after all 32 V1 feature/science items and defect #178 are reviewed and merged. Package/lock/citation become 1.0.0; root contract 0.116.0 and every independent model/schema/POC/plan identity remain unchanged. No scientific arithmetic, seed, fixture hash, exported signature or accepted execution envelope changes.
- Reconcile human/agent/source guidance, actual bounded production integration and closed tier/performance/export/conformance acceptance. Add developer capability navigation, exact root-export reference, packed executable examples, strict documentation/consumer checks and exact owner tag/publish procedure.
- Preserve synthetic/calibration/visibility/PSF/resolution limits and the recorded external-editor/hash/build limitations. Review compatibility/migration and owner handoff in `docs/RELEASE_1_0.md`; this entry does not certify npm publication.
- The preparation evidence is in [the final 1.0.0 preparation audit](https://github.com/Photivra/photivra/blob/main/docs/RELEASE_AUDIT.md).

## Historical development — engine API 0.116.0

The following entries record introduction-time work and version identities. Older pending/draft/issue-count statements are historical checkpoints; the 1.0 release contract and current domain guides own present status.

- Complete the proposed final #131 scientific conformance disposition: shared-reference relative metering and exposure control through independently predicted photon/dark counts, committed production RAW/processing and paired output; controlled light/compensation/time/orientation/render variants, exact replay and fail-closed bindings. Reuse merged tier/performance evidence with explicit synthetic limits; no runtime/API/asset/dependency change. See `docs/SCIENTIFIC_CONFORMANCE.md`.

- Complete the proposed final #43/#45 performance disposition on stabilized V1 main with paired whole-consumer equivalence/timing, preparation/memory profiles and dense executed environment-to-RAW evidence. Retain merged private reuse; no further public abstraction or runtime/API change. See `docs/V1_PERFORMANCE_DISPOSITION.md`.

- Complete the proposed #119 generic tier acceptance layer with reproducible versioned physical/correction-cost/corrected reports, finite multidimensional pupil/texture envelopes, same-capture edge/noise comparisons and independently predicted signed stabilization/ordinary flash checks. Reuse existing body and production/output acceptance; no calibration claims, runtime/asset/version changes or new dependency. See `docs/TIER_ACCEPTANCE.md`.

- Complete the proposed #116 generic preset acceptance disposition: all nine exact body/lens pairings through bounded authoritative environment capture, ISO/readout, exact RAW processing and paired output; independent phase-sum checks and controlled sampled scenes for all 27 finite pupil slices. Preserve synthetic limits, separate #119 validation ownership and unchanged 1.0.0 assets/runtime/version contracts. See `docs/TIER_PRESET_ACCEPTANCE.md`.

- Add the bounded executed environment-to-RAW handoff to the authoritative production graph. Plan 0.7.0 validates committed event, scene/provider/optics, geometry, shutter, rotation, renderer and seed bindings before source callbacks, fingerprints execution data/results, and supplies the exact realized RAW to optional shared processing. Consumer manifest 0.2.0 carries the same immutable execution/output results. Existing attached-RAW and physical-sample paths retain explicit unsupported boundaries. Share existing output-envelope validation without changing supported limits, scientific models, seed schedules or package/POC versions. See `docs/PRODUCTION_ENVIRONMENT_CAPTURE.md`.

## Engine API 0.115.0

- Prepare producer-derived #16 interoperability acceptance: committed all-orientation/manual-WB DNG/JPEG pairs, reproducible repository-only generator, independent TIFF/JPEG/two-XML/LibRaw verification and explicit native-site/unsupported-size evidence. Preserve historical fixtures and shared existing algorithms. Adobe/editor/browser evidence and owner review/DCO remain required; no issue closure, new runtime dependency or API/version change. See `docs/EXPORT_ACCEPTANCE.md`.

- Complete the bounded #112 SDR post-capture handoff: expose shared `calculateProcessedSensorRaw()`/parser for RAW preview and paired JPEG, retain explicit color/WB/rendering/correction states and capture diagnostics, support 8/16-bit preview while JPEG remains 8-bit. Production plan 0.6.0 accepts committed output-state/RAW policy, executes four downstream stages and fingerprints their immutable result/evidence. Upstream missing-stage blockers remain; no physical-provider, high-resolution or external-editor acceptance is inferred. See `docs/PROCESSED_OUTPUT.md`. Merged in #200 after owner review/DCO; V1 tracker stands at 26/32.

## Engine API 0.114.0

- Add `calculateEnvironmentSensorPhotoSignal()` and `simulateEnvironmentSensorRawFrame()`: generate and execute bounded environment queries at each actual local shutter midpoint, wavelength and optional complete PSF support tap, then reuse optics, instantaneous EQE, temporal photo/dark, completeness, capacity, seeded noise and ADC. Bind full native frame geometry, optics, scene identity and event exactly. Frozen provider requests, owned parsed results and aggregate evaluation limits fail closed. Resulting RAW feeds existing paired DNG/JPEG export. Invocation is established without claiming physical provider transport/visibility, calibrated accuracy, full-resolution support or production-plan activation. See `docs/ENVIRONMENT_RAW_CAPTURE.md`. Partial #16/#178 integration; V1 remains 25/32.

## Engine API 0.113.0

- Add `calculateSensorEnvironmentRadianceQuery()`: derive an environment request from native sensor optical support with explicit +Y-down/+Y-up conversion, focus-aware ideal projection, existing analytic inverse camera rotation and outgoing-toward-camera direction convention. Explicit opening-boundary clock mapping preserves time semantics. Ray projection is calculated; intersections, visibility, provider transport and production activation remain absent. See `docs/SENSOR_ENVIRONMENT_QUERY.md`. Partial #16/#178 integration.

## Engine API 0.112.0

- Add `calculateSensorPsfIrradianceQuadrature()`: resolve sampled lens PSFs at each pre-AA destination/wavelength and apply their normalized shape to explicitly supplied inverse kernel support. Convert native +Y-down support to image-plane +Y-up PSF axes; retain separate pupil throughput, wavelength-basis evidence, exact instantaneous times and local shift-invariance limitations. Complete support and bounded work fail closed. No full field-dependent forward transport, source projection/provider execution or production activation is inferred. See `docs/SENSOR_PSF_QUADRATURE.md`. Partial #16/#178 integration.

## Engine API 0.111.0

- Add `calculateSceneSensorEqeTemporalExposure()`: compose declared physical scene radiance through paraxial optics and instantaneous response validity/EQE at every local shutter midpoint. Sensor inputs own spatial/spectral plans; explicit package-plane and first-opening-boundary time semantics prevent plane/clock reinterpretation. Shared internal temporal identity/work preflight preserves existing sensor diagnostics and budgets. No provider/projection/PSF execution, convergence bound or production activation is inferred. See `docs/SCENE_SENSOR_TEMPORAL_EXPOSURE.md`. Partial #16/#178 resolution.

## Engine API 0.110.0

- Add a validated compact temporal EQE photo signal and connect it to exact-event dark/accumulated charge and native RAW. Preserve stationary arithmetic and narrow-call types; share compensated integration sums. Producer result schema 0.3.0 and temporal dark/charge model 1.1.0 distinguish the additive path without changing noise/readout identities. Global/rolling tests verify independent SI counts, deterministic codes and exact paired DNG/JPEG lineage. Source transport/PSF, convergence and production activation remain unverified; no umbrella closure. See `docs/TEMPORAL_PHOTO_RAW.md`. Partial #16/#178 resolution.

## Engine API 0.109.0

- Add `calculateSensorEqeTemporalExposure()`: independently validate response/range/EQE at each explicitly supplied local shutter midpoint and integrate physical rates with seconds-valued measures. Share the existing instantaneous path without changing stationary behavior; retain child evidence, deterministic canonical ordering and bounded Cartesian work. No stationarity, source transport, PSF, convergence or RAW activation is inferred. This new nonstationary result deliberately cannot enter the stationary charge/RAW contract. See `docs/SENSOR_EQE_TEMPORAL_EXPOSURE.md`. Partial #16/#178 resolution.

## Engine API 0.108.0

- Add `calculateSceneToSensorIrradianceQuadrature()`: bind wavelength-resolved scene-provider declarations to each exact spatial/wavelength/time node and evaluate the existing paraxial optical bridge at its pre-AA coordinate. Share Cartesian node validation with the existing irradiance reducer, preserving equations and prior diagnostics while rejecting sparse sample arrays explicitly. Pre-stack/package-incident output feeds matching effective EQE; source projection, provider execution, PSF and temporal integration remain unverified/unapplied, and production gates remain unchanged. See `docs/SCENE_SENSOR_QUADRATURE.md`. Partial #16/#178 resolution.

## Engine API 0.107.0

- Add `calculateSensorEqeLocalExposure`, composing existing spatial/spectral quadrature, explicitly supplied irradiance, response application/range checks, EQE rate, local shutter binding and stationary integration. Preserve child evidence and approximation boundaries; demonstrate the resulting photo expectation through RAW and paired files. Scene/optics origin remains declared, production stages remain gated, and time-varying irradiance is unsupported. See `docs/SENSOR_EQE_LOCAL_EXPOSURE.md`. Partial #16/#178 resolution.

## Engine API 0.106.0

- Map all 32 V1 features to primitives, implemented consumers, representative evidence and remaining ticket ownership. Document the missing typed scene/optics/sensor-response-to-exposure RAW handoff and correct adjacent production-boundary descriptions. Documentation only; no stage activation, runtime/version change, approved deferral or feature closure. Partial defect #178 resolution.

- Define the RAW reference compatibility envelope and share full-native producer/reconstruction limits while retaining the larger structural attachment budget. Export parsing rejects unsupported crop sampling, uncovered output/active reconstruction and non-Bayer topology before pixel execution. Supported execution, hashes, bytes and versions remain unchanged; invalid-request diagnostic precedence may change. Partial defect #178 resolution.

- Move reusable sensor-channel color development and conditioned inversion into an internal color-layer adapter. Preserve explicit profile evidence/basis binding, one-time WB order, exact RAW lineage and paired file identities; export retains validation and container policy. Partial defect #178 resolution; no public API or version change.

- Share sorted-key finite-JSON serialization mechanics across planner fingerprints, capture-derived comparisons and export hashing. Preserve domain-specific undefined-property policies/errors, existing identity algorithms and all version surfaces; pinned historical export/file hashes detect byte drift. Partial defect #178 resolution.

- Consolidate equivalent child-first immutable-data freezing across capture, RAW attachment/reconstruction, export metadata and generic equipment presets into one internal helper. Domain validation/copy ownership and planner/focus/release freeze semantics are preserved; no public API, schema, numerical or identity change. Partial defect #178 resolution.

- Correct production-plan diagnostics to report the current plan contract version instead of a stale hard-coded version, and document the existing `distribute*` public verb family. Diagnostic text changes only; blocker codes, validation, scientific behavior and all version surfaces remain unchanged. Partial defect #178 resolution.

- Add generic tier readout-to-file acceptance: explicit ISO regimes preserve expected/realized charge, independent ADC arithmetic predicts codes, and paired export preserves native RAW through orientation/rendering exposure. Synthetic topology/color/charge fixture; no runtime/API/assets change.

- Add matched generic tier body execution acceptance for release cadence/timer/limits, AF availability/hold/loss and release gating, independent metering/AWB arithmetic, and global readout timing. Synthetic policy evidence only; runtime/API/assets unchanged. See `docs/GENERIC_TIER_PRESETS.md`.

- Extend generic tier correction acceptance with independent residual CA/distortion, full Jacobian/stretch, same-capture slanted-step interpolation/gain and support/retained-ray checks. Synthetic sampled regression evidence only; runtime/API/assets unchanged. See `docs/GENERIC_TIER_PRESETS.md`.

- Correct the electronic read-noise boundary: preserve negative read noise through the upper-only pre-ADC threshold, add the black pedestal, then quantize/clamp to the unsigned ADC range. Readout model 2.0.0 and capture RAW noise model 0.2.0 distinguish changed shadow codes from prior replay.
- Add incremental #131 conformance for the merged global sensor RAW producer → reconstruction/color/WB → correction → SDR/paired export path. Independent numeric and lattice expectations cover exposure boundaries, four orientations, same-noise correction, signed shadows and display clipping; no final V1 closure.

## Generic tier presets — engine API 0.105.0

- Add exact-version Consumer, Prosumer and Professional generic body/lens reference assets, cross-tier selection and strict saved-manifest validation. A finite 50 mm, f/4, focus 5 m optical slice resolves explicit profiles rather than a tier quality multiplier. Matched pupil and same-capture correction fixtures expose field/defocus character and gain/noise tradeoffs. See `docs/GENERIC_TIER_PRESETS.md`.
- Synthetic educational approximations only; no calibration, universal ranking, sensor-format default, production/POC activation or complete #116/#119 acceptance claim. Preset assets are version 1.0.0; saved selection schema 0.1.0. Root API 0.105.0 follows the local-shutter 0.104.0 contract in PR #173.

## Local shutter RAW binding — engine API 0.104.0

- Added optional full-native local shutter-window binding to the RAW producer (producer result schema 0.2.0). Exact per-site photo/dark/completeness windows must match the existing engine timing calculation. Omitted timing retains global behavior and unchanged native seed ownership; no rolling motion/radiance integration or production-stage activation is claimed.

- Reuse call-owned geometric preparation across sampling-plan pixels through the existing scalar point evaluator. Preserve external revalidation, per-point radial/finite guards, provenance and independent derivative arrays. Whole correction/plan timing and separate CPU/allocation evidence are recorded in `docs/GEOMETRIC_PREPARATION_REUSE.md`; no public API/schema version change or generic prepared cache.

- Reuse the existing focus-plane projection privately for POC defocus sweeps. Whole-request timings, separate allocation sampling, preparation/retained-memory limits and 64 complete-response equivalence fixtures are recorded in `docs/POC_PROJECTION_REUSE.md`. No root/POC/schema version change or public prepared API; one-off path overhead and Node-only performance evidence are explicit.

- Add optional RAW-derived JPEG correction to paired photographic export, reusing the capture correction executor after explicit color/WB. Preserve DNG codes and native crop; expose the processed crop, clipping diagnostics and separate informational RAW intent. Require full active reconstruction and reject unprovided prefiltering. No production-stage activation or external-editor validation claim.

## Capture-owned native RAW producer — unreleased

- Added `simulateSensorRawFrame()` and strict handoff parser: declared untreated EQE/dark exposure expectations → existing accumulated charge/completeness → physical capacity assessment → seeded charge realization → read noise/ADC → native CFA samples → immutable RAW attachment. A versioned capture-owned site seed schedule, full native coverage and global exposure/state checks are explicit. Child provenance/saturation diagnostics and genuine same-RAW DNG/JPEG tests are retained. See `docs/SENSOR_RAW_PRODUCER.md`.
- Root API advances to 0.102.0; producer schema/noise identity 0.1.0. Package/POC/capture/RAW-frame/production schemas are unchanged. The reference producer does not verify upstream radiometry, accept RGB as RAW input, support rolling/high-resolution/multi-frame capture or activate reserved production stages. New human review and contribution-specific DCO remain required.

## Capture-bound correction and SDR bridge — unreleased

- Added `calculateCaptureCorrectedSdr()` and its strict parser: committed capture/color/WB → native optical geometry/CA → gain → oriented joint-valid output view → existing SDR rendering. Four orientations, off-center crops, separate clocks and preserved source history are inspectable. Gain clipping events are separately reported by the correction executor. See `docs/CAPTURE_CORRECTED_SDR.md`.
- Root API advances to 0.101.0; package, POC, production and capture schemas are unchanged. No sensor producer, production-stage activation, editor acceptance or new dependency is claimed. Human review and new contribution-specific DCO certification remain required.

## Paired DNG/JPEG reference export — unreleased

- Added `createPhotographicExportPair()` and strict input/color-profile parsers: uncompressed 16-bit native Bayer DNG and baseline 8-bit YCbCr444 JPEG developed from the exact attached RAW frame. Explicit reconstruction, approximate camera color interpretation, existing resolved WB, final orientation/crop and existing SDR rendering are traceable; unsupported resampling fails closed. EXIF/XMP, distinct artifact identities and deterministic SHA-256 provenance accompany owned bytes. See `docs/PHOTOGRAPHIC_EXPORT.md`.
- Integrates pending capture-SDR, RAW attachment, metadata and reconstruction slices as one main-based draft. Proposed root API 0.100.0; export schema 0.1.0. No runtime dependency or package/POC/capture schema change. Full native input is limited to 4,096 sites. Editor interoperability, production execution and high-resolution support remain open gates.

## Same-RAW reconstruction handoff — unreleased

- Added #16C `resolveRawFrameReconstruction()`: bounded native-region values derived only from the attached #166 RAW frame via #14 explicit linear-neighborhood reconstruction, complete absolute-phase dispatch, child provenance and exact source contributions. Signed values survive; missing edges fail rather than padding/clamping/rephasing. Independent captured float planes are not used. No sensor color calibration, downstream WB/color/output processing or file writer is claimed. See `docs/RAW_FRAME_RECONSTRUCTION.md`.
- Proposed root API 0.99.0, handoff schema 0.1.0. Stacked draft requires #166; reconcile parallel additive root versions before merge. Existing package/POC/capture/production contracts are unchanged.

## Native RAW-frame attachment — unreleased

- Added #16 prerequisite `createSensorRawFrame()` and strict input parser: complete bounded native periodic-CFA coverage, exact one-site binding, immutable capture attachment, code/black/digital-white/per-site-seed preservation, and rejection of processed/grouped/multi-frame inputs. Producer origin is explicitly caller-declared; no serializer or RAW-to-RGB pairing proof is claimed. See `docs/SENSOR_RAW_FRAME.md`.
- Proposed root API 0.98.0 and RAW-frame schema 0.1.0. Reconcile additive root versions against parallel drafts before merge; existing package/POC/capture/production versions unchanged.

Notable public changes to `@photivra/engine` are documented here.

## Unreleased

### Added

- Added #1 ideal regular-polygon scalar Fraunhofer diffraction. The additive `calculateIdealPolygonDiffractionPsf()` returns continuous 1/µm² unit-energy density plus peak-normalized intensity using an analytical polygon boundary integral, explicit equal-area pupil size, propagation distance and resolved wavelength basis. No finite-support renormalization, throughput loss or real-lens effects are inferred. PSF foundation advances to `0.3.0`; root API advances to `0.94.0`. Existing circular Airy, sampled/complex-pupil schemas, production composition and POC behavior are unchanged.
- Added standalone #114 parametric clean-lens stray-light irradiance, #118 composed digital geometry/sampling and #117 generic camera-applied lens corrections. Exact system/wavelength bindings, separate ghost/veil contributions, full Jacobians, valid-source masks/joint crops, prefilter gates, channel registration, downstream gain/noise/clipping diagnostics, RAW metadata intent and mandatory/reference-bypass states are explicit. No calibrated presets, production/POC stage activation, optical-PSF repair or runtime dependency is added. See `docs/DIGITAL_OPTICS_FOUNDATION.md`. Root API advances to `0.95.0`; new schemas are `0.1.0`. Pending parallel API changes must reconcile versions in merge order.
- Added #15A/#15B/#15C authoritative capture, color and encoding foundations. `SimulatedCapture` schema `0.2.0` commits immutable format-neutral float planes, explicit linear image states, capture geometry/focal equivalence/focus/WB, public metadata, canonical serialization and external references. Legacy `0.1.0` archives normalize to `0.2.0`. Color model `0.1.0` independently derives the ideal colorimetric camera/linear-sRGB D65 basis, applies explicitly bound resolved RGB gains, or uses an explicitly approximate adopted-white XYZ diagonal transform. Signed floats/headroom are retained; arbitrary spectral/commercial sensor RGB and repeated application are rejected. Linear encoding schema `0.1.0` maps floats to uniform uint16 codes with explicit black/reference-white/headroom, negative and clipping policies, rounding ties and per-side clipping counts while preserving the master. #16 serialization remains separate. Root API advances to `0.96.0`; reconcile pending parallel API changes in merge order. Package/POC/production contracts are unchanged.

- Added independent #112A SDR rendering primitives (schema `0.1.0`) for explicitly color-transformed linear-sRGB/D65 input. Rendering exposure, named identity/positive-per-channel-Reinhard tone choices, explicit component gamut clipping/rejection, standard sRGB transfer, and deterministic 8/16-bit quantization remain separately inspectable. Unresolved WB/color, unsupported HDR policies and non-finite arithmetic fail closed; source samples remain unchanged. No capture/WB/correction adapter or production-stage activation is introduced in this standalone slice. Root API advances `0.96.0` to `0.97.0`; reconcile parallel version bumps in merge order. Package/POC contracts unchanged.

- Added #113 real-lens PSF/aberration framework. Unit-energy sampled 2D PSF profiles preserve image-plane orientation and support bounded regular-grid interpolation across focal length, #103 focus state (via focus diopters, including infinity), aperture, field coordinates, wavelength, and signed image-plane defocus. Best-focus image-plane offsets make field curvature and longitudinal chromatic focus explicit without changing distortion/lateral-CA coordinates. A scalar Fraunhofer complex-pupil reference path jointly evaluates diffraction plus explicit pupil amplitude/optical-path-difference phase while keeping pupil throughput as a separate factor for #110. MTF magnitude-only profiles are diagnostic and explicitly cannot authorize unique PSF reconstruction. Lens PSFs remain upstream of sensor OLPF/CFA/reconstruction and exclude #114 stray light.
- Added #3 extended-object time-varying projection. Explicit metric points on one rigidly translating object are projected independently through physical time with camera and object translation preserved as separate inputs. Pure axial motion can therefore leave an on-axis center nearly stationary while off-axis geometry expands/contracts. A uniform magnification diagnostic is emitted only for an explicitly declared and validated fronto-parallel planar patch; arbitrary 3D geometry never gains a one-scale or one-homography claim. A #12 capture-local wrapper samples the same geometry on each native point's authoritative local exposure clock. The result remains geometry only: no visibility/occlusion solution, synthetic blur kernel, radiance integration, deformation/acceleration, or static-defocus shortcut is claimed.
- Added #97 time-domain physical stabilization with generic synthetic sensor-shift, lens-optical, coordinated-body+lens, and off architectures. Explicit rotational disturbance trajectories are corrected with per-axis gain, latency and angular travel limits; declared panning-axis bypass suppresses only the chosen correction axis; coordinated profiles allocate one total correction without double counting. #12 local-exposure sampling evaluates residual stabilization on the authoritative first-opening-boundary time basis. Support/tripod state, CIPA-style stop ratings, camera translation/parallax, spontaneous drift and digital stabilization are deliberately not folded into this physical model. The legacy `stabilizationStopsEquivalent` API remains unchanged.
- Added #106 manual-flash and ordinary-sync foundations. A flash is represented as a spatial #85 illumination source plus an explicit aperiodic pulse waveform registered to #12's first-opening-boundary time basis. Front- and rear-curtain sync resolve only when the complete active frame has a real simultaneous-open interval long enough for the pulse; impossible ordinary sync fails closed. Existing ambient temporal illumination is preserved when the flash overlay is added. Optional #105 release-frame binding exposes sequence-relative pulse time. Schema 0.1.0 intentionally does not model HSS, TTL/preflash metering, recycle/thermal limits, red-eye preflash, modeling lights, AF-assist, or branded protocols, and never substitutes a post-render brightness multiplier.
- Completed #7 ISO/exposure-index and generic high-ISO signal-chain foundations. Detailed capability profiles now represent standard ISO/EI ranges and grids, expanded low/high settings, Auto ISO eligibility/ranges, and evidenced capture-mode restrictions without inferring photons, conversion gain, read noise, or saturation from the ISO number. A binder carries those constraints into #99 while keeping manual and Auto ISO envelopes distinct. Generic signal-chain profiles map exact ISO/capture-mode states to explicit #14 readout regimes; Good/Better/Best remain convenience mappings to profile IDs rather than real-camera rankings or direct ISO-to-noise equations.
- Completed #14 sensor/RAW closure with deterministic seeded photo/dark shot-noise realization, explicit additional-charge sampling policies, separate electronic read-noise components, evidence-backed conversion-gain regimes, black-level offset, pre-ADC saturation, ADC quantization/digital saturation, native CFA/capture-mode-bound RAW samples, and explicit linear neighborhood reconstruction. Physical storage saturation, pre-ADC clipping, and digital saturation remain separate; scalar physical clamping never claims blooming; ISO never implicitly selects a gain regime; grouped/remosaic modes fail closed without explicit combination math; reconstruction revalidates site/channel identity against the declared CFA and does not claim aliasing/moiré without an adequate pre-sampling optical-frequency model.
- Added #104 generic focus-control with explicit MF, single-AF and continuous-AF policies; renderer-neutral finite/infinity target observations using #103 longitudinal-distance semantics; deterministic ideal-instantaneous AF actuation; explicit idle/acquired/target-lost/locked state; hold-last-focus target-loss behavior with explicit reacquisition; focus lock independent from exposure/metering/WB; and a separate focus-priority/release-priority/balanced capture-gating seam without claiming commercial AF tracking performance.
- Completed #12 sensor readout/shutter closure with exact capture-mode timing profiles, depth-dependent camera-translation/parallax temporal quadrature, and provider-neutral temporal scene-radiance sampling/reduction on the authoritative first-opening-boundary exposure clock. Readout timing remains distinct from exposure timing; unsupported non-uniform schedules fail closed; translation requires metric depth and does not authorize one global homography; camera and subject translation remain separate inputs; per-node radiance uncertainty/evidence is preserved without fabricated aggregate uncertainty.
- Completed the #111 capture-state handoff with `createProductionCaptureSnapshotFromReleaseFrame()`: committed #105 release-frame exposure/focus/automation/timing/seed state and the full resolved #108 white-balance state are validated, frozen, fingerprinted, round-trippable, and surfaced in production-plan capture identity. Legacy direct snapshot construction remains supported.
- Added #134 engine-wide scientific assurance composition with explicit calibrated/approximation/unknown status, required-evidence visibility, quantified/not-quantified/unknown/not-applicable uncertainty states, preservation of existing `CalculationQuality` uncertainty components, and a fail-closed rule against fabricated aggregate uncertainty. #111 production plans and optimized/reference consumer manifests now preserve the same assurance object and include material evidence/uncertainty changes in reproducibility identity.
- Added #135 generic front-of-lens filter transmission with neutral linear, base-10 optical-density, and wavelength-resolved spectral models. Multiple filters compose multiplicatively with preserved component identity/evidence, remain explicitly unpolarized/unbranded, and integrate exactly once into #110 and #111 without changing aperture geometry, working f-number, DOF, or diffraction. Production capture snapshots now preserve the selected filter stack as immutable capture identity.
- Added #108 shooting-time white-balance control and Auto WB foundations over an explicit pre-WB camera-linear RGB domain. Generic profile-owned presets, manual gains, independent CCT+tint intent, clipped-sample-safe custom measurement, deterministic gray-world-style AWB priorities, and AWB lock remain separate from physical scene illumination and #15 render/export color transforms. AWB never reads authoritative scene illuminant metadata as an oracle and resolved WB state never changes exposure, focus, or RAW-like capture data.
- Added #105 deterministic logical release sequencing for single, burst, self-timer, exposure-bracket, and explicit-focus-bracket capture. Generic release capabilities constrain supported drive/bracket modes, maximum frame count/cadence, and inter-frame gap. Scheduling prevents incompatible ordinary-still exposure overlap, derives distinct reproducible per-frame seeds, snapshots base capture state, keeps sensor capture modes separate, and provides an explicit cancellation boundary without conflating WB bracketing with physical multi-exposure capture.
- Completed the generic #100 metering integration seam with reusable generic-body metering capability profiles, explicit metering-profile/mode compatibility assessment, spot/focus-point linkage capability metadata, and end-to-end meter → frozen target → exposure compensation → #99 automatic-exposure tests. Meter target/calibration policy remains owned by the metering profile rather than duplicated into equipment metadata; the controlled relative-light path preserves the -1 EV scene / +1 EV Auto ISO invariant.
- Extended sensor-architecture metadata to schema 0.3.0 with optional evidence-backed `cmos | ccd` technology-family identity. CMOS/CCD remains independent from FSI/BSI, stacking, readout, shutter, CFA, noise, QE, dynamic range, and other behavior; no hidden physics is activated by the metadata. Legacy schema 0.2.0 profiles remain accepted with their original schema identity and never acquire an inferred technology family.
- Added explicit renderer-neutral `FocusPlane` states for finite longitudinal focus distance versus optical infinity. `parseFocusPlane()` keeps JSON/untrusted boundaries fail-closed, while `calculateFocusPlaneImageDistance()` delegates finite focus to the existing Gaussian thin-lens calculation and represents infinity exactly with image distance equal to nominal focal length, zero limiting magnification, and no non-finite/fabricated distance. Existing `focusDistanceM` APIs remain unchanged.
- Extended #111 production composition with immutable temporal-capture input, authoritative local exposure-window evaluation, separate sensor-readout timing, optional pure-rotation temporal quadrature, and renderer temporal-sampling capability checks. Spatial camera rotation and rolling-readout effects now preserve active versus modeled-zero semantics. Exposure/readout clocks remain explicitly unsynchronized unless a later linkage model establishes synchronization. The planner may compute mature temporal foundations while still blocking a requested full temporal image-formation path on uncomposed upstream PSF dependencies rather than bypassing the authoritative graph. Added renderer/reference consumer manifests that project the same finalized semantic plan into interactive-optimized or reference execution roles without changing stage/effect identity, temporal sample count, seeds, or physical results.
- Added the first #111 production image-formation composition contract alongside the legacy POC. The new browser-safe plan separates prepared static context from immutable per-capture snapshots, expands required stage dependencies from the authoritative image-formation graph, records active/modeled-zero/omitted/unsupported/blocked stage and effect states, declares renderer capabilities and capability mismatches explicitly, and provides structured blockers instead of silent fidelity degradation. The first composed physical path consumes #85 scene-radiance samples plus #110 optical throughput to produce pre-sensor-stack spectral irradiance. Prepared contexts, capture snapshots, and plans are cloned/frozen and carry deterministic canonical FNV-1a reproducibility fingerprints; the fingerprint is explicitly non-cryptographic. The legacy POC remains unchanged.
- Added #110's primary optical radiometry bridge from validated outgoing scene spectral radiance to pre-sensor-stack sensor-plane spectral irradiance. The bridge uses an explicit paraxial circular-pupil acceptance term, one mutually exclusive optical-transmission path (wavelength-resolved transmission or an effective working-T-stop approximation), optional field throughput applied exactly once, explicit finite-focus working-f-number semantics, and exact wavelength-basis preservation. It stops before PSF redistribution, distortion-area correction, sensor optical stack/microlens/CFA/QE, stray light, polarization, volumetrics, or wavelength-changing behavior. Numeric spectral curves require reusable/Photivra-owned provenance; calibrated optical data cannot promote the current approximation-only #85 scene-radiance result into a calibrated sensor-irradiance claim.
- Added final #99 Bulb/Time exposure-duration control and cross-mode hardening. Fixed-duration, Bulb, and Time controls now resolve to a concrete positive elapsed duration before physical integration; unfinished Bulb/Time controls remain active and cannot enter the #12 exposure-window pipeline. Resolved control duration binds only the authoritative seconds-valued nominal exposure duration while preserving caller-selected shutter mechanism/boundary schedules and explicitly refusing to infer tripod support, stabilization state, long-exposure noise reduction, or temperature behavior. Long durations are not capped at a universal 30 s. Added invariants proving equal fixed/Bulb/Time durations produce identical exposure windows and identical resolved aperture/shutter/ISO values produce identical downstream relative exposure regardless of shooting mode.
- Expanded #99 with Program Auto and Full Auto exposure plus a shared versioned generic program-line policy. Program-line nodes declare optical exposure stops relative to the explicit reference exposure together with aperture/shutter pairs; resolution validates physical consistency, interpolates aperture/shutter in log2 space, applies #109 capability/grid constraints, and reports endpoint/quantization residuals. Program Auto supports manual or Auto ISO; Full Auto exposure always resolves aperture+shutter+ISO but explicitly does not resolve autofocus, white balance, flash, drive, scene recognition, or stabilization policy. Generic program lines are approximation/product policy, not named-camera emulation or physical law.
- Expanded #99 with a larger priority-mode group: Aperture Priority + Auto ISO, Shutter Priority + manual ISO, and Shutter Priority + Auto ISO. Two-auto-axis behavior is now explicit product policy rather than hidden physics. A+Auto ISO uses minimum selectable ISO until a declared slowest-preferred shutter, then raises ISO; the policy explicitly chooses whether to allow slower shutter after ISO maximum. S+Auto ISO uses minimum ISO with aperture-first selection, then Auto ISO fills remaining exposure. Shutter Priority with manual ISO resolves aperture only. All paths reuse the same #100 target, #109 capability envelope, reference exposure anchor, quantization rules, and signed residual diagnostics.
- Added the next #99 resolver slice: Aperture Priority with manual ISO. Aperture and ISO remain caller-owned; shutter is the only automatic axis. The resolver reuses the same typed #100 meter target, explicit relative reference exposure anchor, and #109 capability envelope as Manual/Auto ISO. Continuous shutter ranges resolve the ideal duration directly; discrete grids quantize in log2 duration space with the shorter shutter on an exact tie. Shutter min/max and grid quantization produce explicit signed residual-stop diagnostics. No-signal targets block automatic shutter without fabrication.
- Added the first #99 exposure-mode resolver slice for Manual exposure with either manual ISO or Auto ISO. Aperture and shutter remain caller-owned and are never changed; manual ISO is preserved exactly after capability validation, while Auto ISO resolves only the ISO axis from the typed #100 meter target and #109 capability envelope. Relative target scale is normalized through an explicit reference exposure anchor rather than a hidden ISO-100 assumption. Discrete ISO values use nearest-log2 quantization with a lower-ISO tie break; ISO limits produce explicit residual under/over-target diagnostics. Unsupported/unknown Auto ISO and no-signal targets block Auto ISO without fabricating a setting.
- Added the first generic #109 equipment-capability foundation for exposure control. Versioned Photivra body profiles now declare evidence-backed shutter-duration and ISO ranges/grids plus distinct supported/unsupported/unknown Auto ISO capability; generic lens profiles declare focal-length range, focal-dependent or constant widest available f-number, narrowest available f-number, and aperture setting grid. A deterministic resolver produces the body+lens exposure envelope at one selected focal length without mutating source profiles or claiming named-equipment emulation. Selected camera state and #99 exposure setting resolution remain separate.
- Added a stable #100→#99 exposure-meter target seam. Spatial or temporal meter results can be frozen into a reusable AE-lock-safe target snapshot; exposure compensation is applied downstream as an absolute stop offset without mutating the meter measurement, and changed compensation requires a new target identity. Positive compensation requests more exposure. No-signal targets remain finite/unresolved, and automatic aperture/shutter/ISO selection remains outside this layer.
- Added the #85→#100 scene-radiance metering bridge plus explicit temporal metering. A derivation profile labels renderer/provider scalar pre-exposure reductions as approximation-only with no calibrated spectral weighting; sample-set creation validates provider, illumination, material, optional temporal-profile, scene-state and capture-time identity. Time-varying metering requires explicit capture times on the shared `first-opening-boundary-phase` reference, and weighted temporal averaging combines linear meter signals under caller-declared positive normalized weights rather than silently averaging stop offsets. Flash/TTL metering, exposure compensation, and automatic aperture/shutter/ISO resolution remain separate.
- Added a renderer-neutral relative pre-exposure metering foundation for #100. Generic multi-zone, center-weighted, spot, and highlight-weighted policies operate on area-weighted linear samples in the physically oriented active capture frame; output crop, tone mapping, display gamma, white balance, sharpening, exposure compensation, and automatic setting resolution remain outside the meter. The meter preserves stable measurement/scene-state identity, returns a finite no-signal state instead of infinite correction, and enforces the controlled invariant that a uniform -1 stop scene-signal change produces a +1 stop shift to the declared relative target.
- Added temporal illumination waveforms and explicit source-waveform↔capture-time registration. Aperiodic flash/pulse and periodic flicker profiles use seconds-based piecewise-linear relative multipliers bound to the existing `first-opening-boundary-phase` capture reference; local exposure integration consumes authoritative exposure-window samples with deterministic midpoint quadrature. Sensor readout timing is never used as an exposure-time proxy, base source magnitude/spectrum remain authoritative, and the layer does not choose exposure settings, apply source magnitude/material transport, calculate scene radiance, or estimate convergence error.
- Added shared continuous spectral-coverage composition plus first-class discrete line-spectrum measures. Continuous participants now intersect explicit air/vacuum support and union interpolation breakpoints without applying spectral values; sensor-response and scene-illumination adapters feed that shared plan. Discrete illumination spectra use normalized wavelength-integrated line weights, distribute broadband source magnitude into integrated per-line quantities, and integrate by summation without inventing a line width or multiplying by dλ. Continuous and discrete paths remain separate, and calibrated absolute line-output claims are still not authorized automatically.
- Added the renderer-neutral scene-radiance provider/material-response boundary. Material profiles distinguish unresolved, RGB/PBR approximation, and wavelength-preserving spectral-data inputs; provider profiles declare spectral/material/visibility/direct/indirect fidelity; evaluation requests bind exact scene/profile/target/time/wavelength identity; results use outgoing spectral radiance in W/m²/sr/nm; and binding validation prevents profile/material/request/result drift without recomputing renderer output. Schema 0.1.0 remains approximation-only at the provider/result level and explicitly does not authorize calibrated radiance, optics/sensor-plane irradiance, photons, fluorescence, volumetric transport, or polarization.
- Added renderer-neutral shared spectral wavelength primitives plus a scene illumination profile for stable point/spot/area/directional/environment source identities, explicit source-specific magnitude units, relative/RGB/blackbody/continuous-spectrum representations, reusable-data provenance, and fail-closed approximation/calibration boundaries. The profile describes illumination only and does not calculate outgoing scene radiance, material response, visibility, indirect transport, fluorescence, volumetrics, polarization, or sensor signal.
- Added `scene-radiance-evaluation` as an explicit image-formation ownership stage between scene projection and lens/pupil evaluation. The stage defines the future seam for outgoing spectral radiance without turning `SceneRadiometry`, source metadata, RGB preview values, or sensor-plane irradiance into interchangeable quantities.
- Added a sensor spectral-response foundation linked to exact color-sampling channel IDs. It supports direct effective external QE, direct effective spectral responsivity in A/W, or explicitly separable channel-filter transmittance × detector EQE; requires reusable rights for embedded numeric curves; uses explicit air/vacuum/unspecified wavelength bases with piecewise-linear interpolation and fail-closed out-of-range behavior; preserves single-condition metadata without inventing angle/temperature/polarization dependence; and keeps spectral integration, photons/electrons, RAW values, and reconstruction separate.
- Added response-breakpoint-aware bounded sensor spectral quadrature. Requested range edges, response-curve knots, and optional caller-supplied continuous-spectrum/optics breakpoints form deterministic midpoint segments with explicit dλ and a maximum subinterval width; response scope/provenance are preserved while response application, source-spectrum integration, photon/electron/current calculation, and RAW output remain separate.
- Added pre-response spatio-spectral irradiance reduction over explicit E_lambda(x,y) samples in W/m^2/nm. The reducer validates exact spatial/spectral profile linkage, caps the Cartesian product, composes normalized AA/aperture spatial measures with dλ, and reports wavelength-integrated spatial-average irradiance plus geometric-aperture incident flux without applying sensor response or temporal exposure.
- Added a sensor-response application compatibility gate. It binds response data to exact color/sampling-aperture/optical-stack identities, validates response reference plane and incident-area normalization, requires explicit spatial response uniformity/separability before post-spatial application, checks declared reference conditions, blocks unresolved wavelength basis, and keeps signal conversion disabled pending a later typed EQE or A/W path.
- Added an evidence-backed sensor-response operating-range gate for instantaneous optical-input linearity. It preserves radiant-power vs irradiance calibration domains, wavelength applicability, reference conditions, uncertainty, and a declared maximum relative nonlinearity criterion while keeping exposure/full-well saturation and downstream electronics linearity explicitly separate.
- Added a photon-energy wavelength-basis foundation using exact SI Planck constant and vacuum light speed. Vacuum wavelengths map directly; air wavelengths require an exact-wavelength sourced phase refractive index plus explicit atmosphere compatibility, and refractive-index uncertainty is preserved without falsely claiming uncertainty propagation.
- Added typed EQE/filter×detector-EQE instantaneous electron-rate conversion. The converter validates structural and operating-range authorization, requires explicit spatial linear superposition and per-spectral-bin operating-range applicability, binds response evidence and evaluated bin inputs to the exact pre-response reduction, converts each wavelength-bin power contribution to photon rate with the photon-energy foundation, applies effective QE per wavelength, and returns expected electron rate without temporal integration.
- Tightened the operating-range gate so wavelength-dependent rate conversion now fails closed unless both geometric-aperture linear superposition and per-spectral-bin input applicability are explicitly established. Broadband-only range evidence remains diagnostic but cannot authorize EQE/A-W conversion.
- Added typed A/W spectral-responsivity conversion from per-wavelength geometric-aperture radiant power to detector-terminal photocurrent magnitude. The path requires the same structural/spatial/per-bin operating gates as EQE plus an explicit electrical applicability profile for detector bias and current-readout loading; transimpedance, voltage, temporal charge, saturation, noise, ADC and RAW remain downstream.
- Added local sensor-rate/exposure-window binding. Engine-produced EQE and A/W rate results now preserve source color-site identity; the binding validates the exact site channel, requires an evidenced one-to-one color-site/native-effective-raster relationship, recomputes the local shutter window at the mapped native sample center, and deliberately leaves constant-rate temporal integration unauthorized.
- Added evidence-bound constant-rate temporal integration for exact local exposure windows. EQE rates become fractional expected photon/electron counts; A/W photocurrent becomes charge magnitude in coulombs without carrier inference. Results remain photo-signal-only and explicitly cannot authorize full-well or camera-saturation assessment.
- Added dark-current charge accumulation for the EQE electron-count path. Dark current is explicitly pre-compensation thermal electron generation in e-/s, can use exact-reference temperature or fail-closed piecewise-linear measured temperature tables, and does not infer a universal exponential temperature law or dark-current nonuniformity.
- Added accumulated stored-charge composition and completeness assessment. Photo and dark expected electrons plus explicitly incremental additional stored-electron contributors are rebound to one exact local exposure; only an evidence-backed all-material-contributors completeness declaration authorizes later physical full-well assessment.
- Added physical charge-storage capacity assessment against complete expected stored electrons. Capacity is explicitly distinct from camera saturation/digital clipping, remains bound to sensor site/operating state/temperature applicability, and reports expectation-vs-capacity without clamping, blooming, overflow redistribution, or stochastic saturation claims.
- Added camera signal saturation-capacity assessment in dark-corrected photo-generated electron-equivalent units. The comparison deliberately excludes dark/other stored charge, does not reuse physical full-well capacity, and does not infer which analog/digital stage limits the camera response.
- Added exact canonical response-channel data binding from spectral quadrature through spatio-spectral reduction. EQE and A/W converters now reject numeric calibration-curve drift even when profile IDs and evidence references are unchanged; the binding is an exact data-identity mechanism, not a cryptographic integrity checksum.

### Changed

- Engine API contract advances to `0.97.0`; production image-formation plan contract advances to `0.5.0`; scientific-assurance contract remains `0.1.0`; production capture snapshot advances to `0.3.0`; production plan consumer manifest remains `0.1.0`; image-formation contract remains `0.4.0`; Exposure Mode Resolver remains `0.5.0`; Exposure Duration Control remains `0.1.0`. The composed POC remains `0.20.0`; package version remains `0.6.0` until the next public release.

## 0.6.0 - 2026-09-29

### Added

- Added a standalone native-sensor readout scan timing foundation with separately evidenced seconds-valued capture data-readout duration and rolling spatial-sampling skew, native scan direction, active-capture support, pointwise native phase diagnostics, and independent mechanical/EFCS/electronic shutter-mechanism metadata. The first model is explicitly a uniform-linear single-axis approximation and does not infer physical readout lines from the effective image raster.
- Added a standalone capture exposure-window timing foundation with independent opening/closing boundary schedules, simultaneous or uniform-linear native scans, explicit mechanism-derived boundary actuators, evidence-backed timing/direction declarations, full-active-region positive-duration validation, and local exposure-window diagnostics relative to the first opening-boundary phase. Sensor readout remains a separate contract.
- Added a capture-rotation exposure trajectory foundation that maps native sensor points into the reference image plane and evaluates the existing pure-rotation camera model at each point's local exposure start/end. It preserves exposure-window and rotation provenance, excludes sensor readout timing, and explicitly stops short of claiming a rolling-shutter warp or integrated blur kernel.
- Added an analytic inverse pure-camera-rotation mapping plus an instantaneous capture-scan inverse mapping at an explicitly selected local-exposure phase. The capture mapping uses destination-native timing, reports native/oriented effective-sample displacement, does not clamp reference rays outside the active frame, and intentionally avoids iterative solving, sensor-readout coupling, and finite-exposure blur claims.
- Added an evidence-backed readout/exposure spatial-linkage assessment for declaring normalized native scan-phase relationships between rolling sensor readout and electronic exposure boundaries. It supports same/reversed spatial phase, preserves evidence-backed seconds facts, reports cadence ratios, and explicitly does not infer absolute temporal synchronization from shutter mechanism, scan direction, equal timing spans, or total data-readout duration.
- Added deterministic pure-rotation temporal quadrature over each destination point's local exposure window. The first model uses uniform midpoint nodes, preserves the #65 instantaneous inverse mapping as the geometry source of truth, reports both normalized time-average weights and seconds-valued integration measures, and deliberately does not calculate radiance, a blur kernel, or a geometry-only integration error estimate.
- Added the first capture-mode profile/resolution contract with orthogonal acquisition sequence, per-frame sampling, optional evidence-backed inter-frame sensor offsets, reconstruction stages, processed-image raster, and downstream dependency declarations. Grouped sampling preserves unknown vs charge-domain vs pre-conversion-analog vs post-conversion-digital combination semantics; processed/output resolution never mutates physical sensor identity or permits photosite-count inference.
- Added the first exact color-sampling topology contract. It supports monochrome and arbitrary periodic mosaics on an abstract native sensor sampling-site lattice, preserves sensor-anchored repeat phase, allows arbitrary semantic channel IDs without implying spectral calibration, and represents layered color as structural-only until per-layer spatial sampling is modeled. It intentionally does not bind color-sampling sites to `NativeImageRaster` or physical photodiodes.
- Added an evidence-backed native-effective-raster ↔ color-sampling-site-grid binding plus capture-mode structural-source resolution. The bridge binds one exact native effective raster to regular color-site blocks, requires separately evidenced grouped-mode phase, preserves absolute CFA phase, reports compact source rectangles and exact channel-site counts, keeps pixel-shift offsets from changing CFA assignment, and fails closed for declared-effective or layered relationships that are not explicitly mapped.
- Added a sensor optical-stack foundation that separates ordered physical stack-component metadata from effective anti-aliasing spatial response. Effective AA response may be explicitly absent, present-but-unresolved, or an arbitrary normalized point-splitting kernel in native sensor physical coordinates; microlens and cover/filter-stack presence remain descriptive until later angular/spectral/refraction models exist. Unknown AA response remains distinct from documented absence.
- Added a sensor sampling-aperture foundation that explicitly registers the color-site lattice in native sensor physical space and describes a first geometric photosensitive aperture as an optional uniform axis-aligned rectangle. Site pitch/origin and aperture geometry carry separate evidence, unresolved aperture stays fail-closed, geometric fill fraction is diagnostic only, and AA, microlens redistribution, charge diffusion/crosstalk, spectral response, QE, optical throughput, radiometric collection area, and physical photodiode truth remain outside the model.
- Added deterministic sensor spatial-sampling quadrature that combines the resolved geometric aperture with effective AA point splitting using inverse source mapping. It returns native-physical midpoint nodes, separate normalized-average and square-micrometre area measures, preserves destination CFA channel semantics, retains off-imaging-area pre-AA support without clamping/renormalization, and deliberately does not produce optical-field values, photons/electrons, RAW samples, or reconstruction.
- Added sensor spatial-sample reduction for explicitly identified quadrature-node values. It supports nonnegative relative-linear irradiance proxies and physical sensor-plane irradiance in W/m², preserves node identity independently of input ordering, returns normalized spatial averages plus geometric area integrals/incident flux, and keeps CFA spectral response, temporal integration, QE, noise, ADC, RAW code values, and reconstruction separate.

### Changed

- Engine API contract advances to `0.47.0`. The composed POC remains `0.20.0`; the engine can now reduce explicitly identified nonnegative linear spatial samples in either relative or physical irradiance domains without claiming CFA spectral filtering, temporal exposure, sensor conversion, or RAW output.

### Fixed

- Hardened npm package-surface validation so every relative module re-exported by the built root `dist/index.js` must also be present in the packed tarball; added previously missing public `capture`, `composition`, `equipment`, and new `color` dist directories to the package whitelist.


- Radial-distortion invertibility validation now uses scale-normalized, cancellation-resistant stationary-point solving so near-linear high-order profiles cannot hide an interior fold; unsafe derived normalized radii and malformed/sparse batch points fail closed as scientific input errors.
- Reverse image-plane coordinate mapping now uses a physical-scale floating-point edge tolerance instead of a fixed normalized-UV tolerance.

### Performance

- Inverse radial mapping resolves exact identity and mapped-boundary cases directly and stops deterministic bisection once IEEE-754 bounds can no longer narrow.
- The image-formation benchmark now warms and amplifies measured work, alternates scalar/batch ordering, reports paired median ratios, remains informational-only, and avoids a duplicate CI build.

## 0.5.1 - 2026-09-26

### Fixed

- Inverse radial distortion now tolerates only floating-point-scale overshoot at the validated mapped operating boundary and clamps the solver target to that boundary, preventing exact limiting coordinates from failing because of one-ULP polynomial rounding while keeping materially out-of-envelope destinations fail-closed.

## 0.5.0 - 2026-09-26

### Added

- `calculateInverseRadialDistortionMappings()` and `calculateInverseLateralChromaticAberrationMappings()` for multi-point inverse field sampling with one profile-validation/provenance boundary per batch; scalar APIs remain unchanged.
- `mapOrientedPhysicalUvToImagePlanePoint()` and `mapImagePlanePointToOrientedPhysicalUv()` for explicit round-trip conversion between normalized oriented physical raster regions (+Y down) and the pre-orientation optical image plane (+Y up), preserving all four capture orientations and asymmetric/off-axis bounds.

### Changed

- Engine API contract advances to `0.34.0`. The composed POC remains `0.20.0`; this release adds standalone coordinate and batch lens-field APIs without composing lens-field effects into the POC.

## 0.4.0 - 2026-09-25

### Added

- `getImageFormationContract()` and `IMAGE_FORMATION_CONTRACT_VERSION` defining public scientific ownership domains, coordinate spaces, hard stage dependencies, cross-stage couplings, temporal semantics, renderer warp/alpha/occlusion rules, and reserved sensor/reconstruction ordering.
- Explicit effect placement for focus breathing, distortion, lateral chromatic aberration, illumination/mechanical vignetting, non-circular diffraction, field-dependent PSF effects, time-parameterized camera rotation, rolling readout, CFA/photosite sampling, sensor statistics, and reconstruction.
- `calculateCameraRotationImageMapping()` for field-position-dependent, time-parameterized pure camera rotation using exact axis-angle integration of constant pitch/yaw/roll angular velocity.
- `calculateFocusBreathingProjection()` and `calculateFocusBreathingFieldOfView()` for an explicit caller-declared projection scale at the selected focus state, without mutating physical focal length or inventing a lens-specific breathing curve.
- `calculateRadialDistortionMapping()` plus `calculateInverseRadialDistortionMapping()` for generic optical-axis-centered radial field mapping with explicit normalization radius, declared operating envelope, and fail-closed monotonicity/invertibility validation.
- `calculateLateralChromaticAberrationMapping()` plus its inverse for green-reference channel field mapping: one common base distortion plus red/blue coefficient offsets, deterministic per-channel source sampling, and physical separation diagnostics.
- `calculateIlluminationVignetting()` for generic radial field-dependent linear throughput with full-envelope extrema validation, positive stop-loss reporting, and a strict separation from pupil/PSF vignetting.
- `getPsfFoundationContract()` and `calculatePsfFoundationComponents()` for explicit field/depth/wavelength/pupil context plus separately preserved geometric-defocus and circular-diffraction diagnostics, with future pupil/field contributions reserved but not implemented.

### Changed

- Engine API contract advances to `0.32.0`. The image-formation contract remains `0.2.0`; the new PSF/pupil foundation formalizes already-partial field/PSF ownership without changing composed POC semantics. The composed POC remains `0.20.0`.

### Fixed

- Tightened final output-raster aspect validation so only nearest-integer rounding from one isotropic scale is accepted; fixed-percentage tolerance no longer permits visible anisotropic stretching.
- Calculation-quality validation now fails closed on unknown runtime uncertainty `kind` and `source` values instead of treating unknown discriminants as valid metadata.

### Documentation

- Added the image-formation contract guide and synchronized architecture, physics, motion, API-style, and agent guidance around partial-order/coupled-stage semantics and reserved sensor stages.
- Documented the physical camera-rotation sign/axis conventions, field-dependent mapping, and compatibility boundary with the legacy stabilization-equivalent approximation.
- Documented the declared-scale focus-breathing model, its zero-breathing compatibility case, and the prohibition on inferring real-lens behavior from focal/focus metadata.
- Documented radial distortion normalization, forward/inverse mapping, operating-envelope monotonicity, and the boundary excluding tangential/decentered and named-lens behavior.
- Documented lateral CA as channel-dependent field mapping rather than RGB blur, including the non-spectral/non-CFA calibration boundary.
- Documented illumination vignetting as scene-linear/channel-linear throughput only, including full-envelope validity checks and the boundary excluding mechanical/pupil vignetting and PSF/bokeh changes.
- Added the PSF/pupil foundation guide, preserving defocus and circular diffraction as separate diagnostics and reserving future pupil clipping, non-circular diffraction, field curvature, aberration, and bokeh contributions without claiming a combined PSF.

## 0.3.0 - 2026-09-25

### Added

- `calculateSensorGeometryMetrics()` plus `SensorImagingArea` and `NativeImageRaster`, separating physical imaging geometry from native effective image resolution while deriving diagonal 35 mm crop factor, megapixels, and independent X/Y sampling pitch.
- Explicit provenance assumptions that prevent geometric sample spacing from being treated as photosite active area or photon-collection area.
- `resolveCaptureGeometry()` with invariant native sensor coordinates, active capture rectangles, physical camera orientation, digital output crop, and final output raster separation.
- `calculateActiveCaptureFieldOfView()`, which reuses the canonical field-of-view model and preserves diagonal FOV across 90° orientation changes.
- `calculateImagingAreaMetrics()` as the shared diagonal crop-factor primitive for physical imaging areas.
- `calculateEquivalentFocalLength35Mm()`, keeping physical focal length authoritative while deriving conventional diagonal-based 35 mm equivalence from the active physical capture area.
- `parseSensorArchitectureProfile()` plus evidence-backed independent metadata axes for illumination, stacking/integration, readout capabilities, and color-sampling family.
- `calculateFieldOfViewBounds()` for asymmetric/off-center sensor-plane angular bounds.
- Exact native↔oriented raster point/vector/rectangle transforms for all four physical camera rotations.
- `RasterDimensions` as the generic active/output raster contract while `NativeImageRaster` remains the semantic native-raster alias.
- Off-center active-capture optical-axis offsets/bounds, asymmetric FOV, and dual diagonal-corner angular spans.
- Output-raster aspect-ratio validation that rejects implicit geometric stretching.
- `calculateOutputFieldOfView()` plus explicit physical final-output bounds and output resampling scale.
- `parseRadiometryReadinessProfile()` and `assessRadiometryReadiness()` for explicit scene/optics/photosite/exposure/sensor-response prerequisite gating before any future photon simulation.

### Changed

- Engine API contract advances to `0.25.0`.
- Composed POC simulation API advances to `0.20.0`, preserving legacy requests while completing staged capture orientation/active/output geometry, final-output FOV, capture-mode viewing CoC, orientation-aware subject framing, and explicit output sampling scale.
- The composed POC exposes shared sensor-geometry metrics while retaining backwards-compatible representative pitch fields.
- Capture-geometry mode continues to reject stacking legacy `crop.factor` with staged capture, while subject framing and equivalent-viewing CoC now use explicit staged output/viewing semantics.
- The composed POC continues to expose X/Y sample pitch diagnostics and rejects sensor geometry whose X/Y geometric pitch differs by more than 1% until all pixel-domain calculations are axis-aware.
- Unreleased sensor-architecture schema advances to `0.2.0`: source origin and reuse rights are independent, scalar facts accept multiple evidence records, and each readout capability carries its own evidence.
- `InvalidConfigurationError` now lives in the core dependency layer and remains re-exported from the existing public surface.
- Radiometry readiness distinguishes `not-ready`, `approximate-only`, and `calibrated-ready`; assessment never enables composed photon output by itself.

### Documentation

- Synchronized human and agent guidance with the post-0.2 sensor/capture foundations, evidence/reuse-rights model, radiometry readiness gate, independent API-version surfaces, composed-POC integration boundary, and coordinate/sampling invariants.

## 0.2.0 - 2026-09-21

### Added

- `calculateRelativeRenderedExposure()`, a deterministic relative rendering relation that combines aperture/shutter optical exposure with nominal ISO gain relative to declared reference settings.
- Public input and result types for the relative rendered exposure calculation.

### Documentation

- Added usage guidance and scientific limitations for relative rendered exposure.
- Synchronized package, lockfile, README, and citation version metadata for the release.

## 0.1.0 - 2026-09-20

- Initial public release of the Photivra engine package.
