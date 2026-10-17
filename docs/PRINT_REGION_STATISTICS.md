# Regional linear Print statistics — model and protocol 0.1.0

These browser-safe protocols measure two different things in one image region:

- the **difference caused by processing**, between two registered versions of the same capture; and
- the **sample variance across repeat captures** of a still scene (temporal noise).

They add to the Print detail evidence work (issue #196). They do not complete its acquisition, perception, subject/depth, motion or full release acceptance. The coherent [detail diagnostic](PRINT_DETAIL_ASSESSMENT.md) stays at model 0.1.0, with its existing behaviour.

## Source and applicability

**Per-frame inputs.** Each frame uses the existing Print source, and declares:

- the scalar relative-linear luminance domain, explicitly;
- the actual represented raster;
- a half-open region in oriented retained coordinates;
- capture, representation, content and processing identity;
- evidence and noise-realisation identity.

Source and region parsing share the boundary used by the coherent diagnostic. Arrays must be dense and finite.

**Limits.**

- The whole request contains at most 65,536 scalar samples, counting every repeat, or both members of a pair.
- A noise ensemble has 2 to 256 frames.
- This is a limit on work, not a claim about device performance.

**Geometry rules.**

- The represented raster must keep the retained native aspect ratio, and cannot exceed either native axis.
- Native-stage rasters must match the retained native crop.
- Warps that are not validated, and non-linear or unknown domains, are blocked.
- Registration compares the full parsed geometry, region and Print conditions conservatively. It does not resample, and does not invent a correspondence.
- For a paired comparison, the caller must normalise conditions that are expressed in different physical units.
- Insufficient native sampling, or conflicting lab conditions, stay visible in the returned Print plan. A sample statistic cannot fix delivery.

**What is declared, not verified.** Hashes, numeric provenance, stationarity of the acquisition and independence of repeats are all declarations by the caller. Successful parsing or calculation never verifies file contents, decoding, a licence or physical calibration.

Results freeze copies of their inputs, keep the engine and model identity, and explicitly return: acquisition unassessed, uncertainty unquantified, and no overall verdict. Downstream, any change to source, region, processing, acquisition or viewing condition needs a new assessment identity.

## Paired processing difference

`calculatePrintRegionDifference()` compares the same sample sites in two representations of one immutable capture.

**Which pairs are allowed.**

- Either a declared deterministic reference (both noise IDs null), or the same explicitly named non-null noise realisation.
- Different or unknown noise draws cannot be compared as a processing-only change.
- A single noisy frame does not give a noise variance.
- Comparing against a decoded file needs the pre-encoding `post-resampling-linear` stage and the exact `post-encoding-decoded-linear` stage.
- The same representation ID with a contradictory hash, stage or processing identity is blocked.

**What is returned.** For differences `d_i = after_i - before_i`, in relative-linear luminance:

- the signed mean;
- `sqrt(sum(d_i²)/N)`;
- the largest absolute difference.

This measures the net change between the two supplied representations. It does not automatically blame JPEG compression, classify artifacts or establish visibility. Exact binding of the pre- and post-encoding artifacts, and independent validation of the decoder, remain external evidence obligations. Comparing different rasters needs an independently registered reference on identical sample sites; this protocol does no resizing.

**Optional signal range.** You can declare an increasing reference signal range. The result then gives, separately for both representations, counts below and above the range and the largest excursions.

- In an independently designed experiment, this can measure known undershoot or overshoot around a step. It is not an automatic halo detector.
- Excursions already present in the source stay visible.
- The range endpoints are not sensor full well or ADC/render clipping thresholds. Touching the boundary, or exceeding it, cannot establish a clipping mechanism.
- Colour channels, gamut error, printer texture and natural-image quality stay unassessed.

## Temporal repeat statistics

`calculatePrintRegionNoise()` uses a declared stationary scene and independent repeat captures, at identical registered sites, geometry and processing stage.

**Identity rules.**

- Each repeat has its own capture, representation and non-null noise-realisation identity.
- Reused identities, differences in stage or processing, and missing noise IDs block the calculation.
- Identical bytes in separate repeats are allowed: zero noise, and repeated quantised values, are valid observations.
- IDs alone cannot prove independence or stationarity.

**What is computed.** At each sample site:

- the temporal mean;
- the sample variance, `sum((v_j - mean)²)/(n-1)`.

The result returns those arrays, the mean of the per-site temporal variances and its RMS, and the average of the site means.

**What it is not.**

- The spatial variance of a textured image is deliberately not called temporal noise.
- Fixed-pattern variation, drift, correlations and non-stationarity need separate models.
- These are sample statistics, not an ensemble expectation, a sensor SNR, a confidence interval or an uncertainty bound.
- The statistic itself makes no Gaussian, Poisson or independent-pixel assumption.

**Numerical care.**

- Each site's values are normalised by their largest absolute value.
- The mean of offsets from the first repeat is computed, and those offsets are centred, before units are restored. A rounded large-DC mean must not add false variance.
- Compensated accumulation and hypot norms reduce avoidable overflow and cancellation.
- These are rejected: nonzero inputs or differences lost in normalisation, non-finite restored statistics, and nonzero variance or RMS that underflows.
- Supported numeric results are finite. Unsupported numeric ranges return no measurement, rather than zero or a made-up uncertainty.
- No epsilon changes a measurement or a sampling verdict.

## Independent qualification protocol and rights

1. **Independent oracle.** Use an independently written Python standard-library oracle, with exact rational arithmetic, for finite paired signals and repeat statistics. Commit its inputs, expected values and SHA-256. The reference must not import the engine, or compute expected values from runtime outputs.
2. **Coverage.** Cover positive, signed and zero levels; correlated spatial texture with zero temporal noise; asymmetric and directional step overshoot; tiny values; large DC with small fluctuations that can still be represented; same and different realisation policies; malformed inputs; missing or mismatched stages; and the total work limit. Numeric tolerances validate the arithmetic on that bounded domain only.
3. **Backend evidence.** For more evidence about the backend, run the existing production charge/readout and image-formation functions. Keep the raw, linear, SDR and JPEG stage identities. Seed schedules and sample counts must be declared in advance. Compare realisations against an independent reference for the distribution and the processing. A synthetic target name alone does not validate an active backend.
4. **Convergence and records.** Measure convergence with repeat count and quadrature independently, before any physical or statistical claim. Record in the capability ledger: reference, backend and analysis versions and hashes; region; units; domain; source dimensions; conditions; and pass, fail or unassessed state. Publish observed conformance separately from human review of science and sources.

**Electronic readout evidence.** The [candidate review](PRINT_195_196_REVIEW.md#linearhigh-bit-electronic-readout-qualification) records a real public native RAW run, with an independently predicted 12-bit electronic reference.

- It keeps storage, pre-ADC and digital clipping separate, and keeps signed read noise.
- It bounds the effects of decoded quantisation, without treating quantisation as independent uniform noise.
- Its conditional neutral scalar encoding and declared electronic inputs do not establish physical photometry or sensor calibration.

**Rights.** All new equations are elementary paired differences and sample statistics, written independently. New procedural signals and reference code are Photivra draft material under Apache-2.0, subject to human review of science and sources, and DCO. No external numeric curve, camera profile, dataset, runtime dependency or private scene is included.

The researched [castleCSF primary paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC10996938/) and [upstream repository](https://github.com/gfxdisp/castleCSF) describe a possible later perceptual model. These protocols include none of its code, coefficients or observations. A perceptual application would need its own licence and source audit; matching of stimulus, observer, luminance, area and eccentricity; and independent validation. These statistics cannot provide that.
