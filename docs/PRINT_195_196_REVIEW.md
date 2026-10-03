# Print #195 / #196 candidate evidence and release review

This record accompanies the 1.2.0 candidate. It preserves the full #196 acceptance gate: bounded computational conformance does not close the device/backend, proof UI or natural-image perception obligations. No tag or distribution is created. Historical 1.1.0 diagnostic ledgers and JPEG artifacts remain unchanged.

## Planning acceptance (#195)

The existing public planner is tested against an independent exhaustive sample-count search for stamp, book, home, gallery, billboard and distant large-sign conditions on one immutable retained source. Heavy off-center crops expose insufficient native sampling. Smaller-size alternatives recover only within the original exact integer aspect family. Zero physical dimensions are rejected and a corrected request recovers. Enlarged delivery dimensions do not create native sampling. These are planning checks, not source-quality claims. See `test/print-plan-acceptance.test.ts` and [the planning contract](PRINT_PLANNING.md).

## New diagnostics and independent references

The [linear statistics protocol](PRINT_REGION_STATISTICS.md) separates paired processing changes from independent-repeat temporal sample variance. The [contrast reference](PRINT_CONTRAST_REFERENCE.md) exposes a restricted static neutral D65 Gabor model estimate with explicit luminance and reference-observer conditions. It does not label a photograph visible, sharp or printable.

| Experiment | Executed backend | Independent reference | Supported meaning |
| --- | --- | --- | --- |
| Registered differences and repeats | New bounded scalar statistics | Exact binary64 rational arithmetic / high precision RMS | Finite arithmetic and sample statistics, not acquisition calibration |
| PSF/aperture detail | Public local PSF + spatial/spectral quadrature | Sparse complex transfer, midpoint aperture sum and continuous sinc | Owned neutral periodic signal; finite kernels; all orientations; off-center ROIs |
| Photocharge noise | Public accumulated-charge / seeded realization | Poisson mean and variance-of-sample-variance moments | Independent seeded ideal photocharge, 4 sites, 32–256 repeats; no ADC/read noise |
| JPEG processing changes | Public SDR/JPEG exporter, archived independent Pillow/libjpeg decode | Exact decoded neutral scalar paired differences | Exact preserved JPEG bytes, orientation, stage and source hashes; no automatic artifact classifier |
| Subject depth / intentional defocus | Shared thin-lens geometry + public complex-pupil propagation + owned visible-plane provider | Separate finite complex DFT and ray-plane reference | 2/5/10 m overlapping static planes; 5 m focus; f/8,16,32; 500 nm; 9×9 ideal pupil; interior ROIs |
| Translation motion | Public local exposure timing + translation/parallax nodes + owned periodic plane accumulation | Closed finite geometric transfer and continuous exposure sinc | Constant depth/visibility; 2/5/10 m; camera/subject velocity 0/1 m/s; 20 ms; 2–32 nodes |
| Static contrast reference | Restricted castleCSF equation adapter | Independent 80-digit Decimal arithmetic | Numerical model conformance only; no new psychophysics or individual observer calibration |

All generator inputs and JSON expected outputs are committed under `test/fixtures/print-detail/`; tests pin reference SHA-256. References never import the engine or derive expected values from its output. Every new scene/provider is owned draft material, not a private app fixture or camera dataset. These test adapters execute the named public backend; they do not qualify an unnamed renderer or device by association.

## Finite-focus propagation correction

The depth experiment exposed that the complex-pupil reference used nominal focal length for image sample pitch even when finite focus metadata was present. Model 1.1.0 adds explicit `propagationDistanceMm` and returns the distance/source. Omission preserves all legacy kernel values. The owned principal-plane fixture explicitly passes the shared thin-lens image distance. Real exit-pupil geometry needs separate evidence. No blur-diameter-to-PSF approximation or duplicate camera equation is introduced. See [PSF foundation](PSF_FOUNDATION.md).

The new depth test is a finite scalar pupil conformance test. Its 9×9 pupil grid is **not** a continuum convergence certificate. All finite taps for every selected ROI must hit the same visible surface. Depth-edge diffraction/occlusion composition, moving visibility, lens distortion and corrections are unsupported by that experiment. A background explicitly marked intentional defocus never becomes failed source quality.

The motion reference checks continuous-exposure convergence and separately composes camera and subject velocities. It does not use an endpoint chord as a PSF, change exposure from readout duration, or authorize one homography across depths. PSF/aperture tests independently check spatial quadrature convergence. Stochastic repeat-count checks use predeclared broad moment bands; random sample estimates need not converge monotonically and these bands are not confidence intervals for a photograph.

## Source and reuse review

The castleCSF numeric model material is pinned to upstream `f4b0b722af83001d7af979281e06ca642d36e4e8`. MIT notices are retained in [the license](licenses/castleCSF-MIT.txt), `NOTICE` and `THIRD_PARTY.md`. No observational CSV or separately licensed dataset is incorporated. The public [primary paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC10996938/) supplies scientific context; upstream numerical conformance does not supply a new observer experiment. Quadratic paraxial pupil phase and finite propagation are consistent with the scalar diffraction framework described by [Braat and colleagues](https://nijboerzernike.nl/_PDF/BraatProgOpt2007OwnVersion20080515.pdf); no text, figures, tables or implementation from that source are copied.

Substantive human scientific/source and contribution-specific DCO review remains pending for this new change. Approval of PR #216 does not certify these new coefficients, adapter, protocols or owned test material.

## Candidate checks

On Node 26.8.1, all 1,986 tests in 154 files pass. Coverage is 92.04% statements, 88.54% branches, 99.63% functions and 92.04% lines. Build, static/license/SPDX/identity/browser checks, generated references, documentation links, 67 strict packed documentation consumers and the 809-file package surface pass. The [evidence inventory](validation/print-196-candidate-evidence.json) pins generator/artifact and reviewed upstream source hashes. These observations do not replace supported Node CI or substantive human review of the exact candidate commit.

## Full #196 release blockers

The [candidate capability ledger](validation/print-196-candidate-capabilities.json) records bounded support and missing qualification separately. The following still prevent full #196 acceptance and the requested release after it:

- Independently qualified active capture/backend evidence for the claimed source detail domain, including lens/field, source headroom and continuum/support convergence. Owned finite reference execution cannot certify a private production renderer or actual capture device.
- Qualified high-bit/linear stage evidence for physical noise, tonal clipping and readout. Current ideal photocharge statistics exclude dark/read noise, full-well/ADC/render clipping and physical calibration.
- Backend evidence for subject/depth/occlusion across the actual supported coordinate/correction/viewpoint domain, and temporal visibility changes where claimed. Interior finite-plane references exclude depth-boundary composition.
- A perception application whose actual stimulus, luminance, contrast, area and observer conditions match the supported model. A rectangular coherent grating or natural-image ROI is not automatically a Gaussian-envelope Gabor stimulus. Color, aliasing, halos and natural-image visibility remain independently unassessed.
- Exact physical proof/comparison scale and immutable capture/region/output binding in the product integration required by #196/#307. The standalone engine tests cannot certify private UI scale, accessibility or device rendering.
- Human scientific/source review, contribution DCO certification, exact-head CI, final-main release gates and explicit publication approval.

Do not close #196, downgrade these gates, or describe the release as ready because computational tests pass. #195 can be closed on acceptance of its planning audit. #215 remains open until the approved distribution is published.
