# 2.14.0 release candidate

> **Prepared November 1, 2026; the owner has approved tagging and releasing 2.14.0 (chat, November 1, 2026); not published.** Publishing runs only from the `v2.14.0` tag, after `main` CI on the tagged commit has passed (see [Release gates](#release-gates)).

## At a glance

- **What is proposed:** publish `@photivra/engine@2.14.0`, with `ENGINE_API_VERSION = "2.14.0"`. `POC_SIMULATION_API_VERSION` stays `1.0.0`.
- **Why a minor version:** 16 new root exports, a new chart preset, a new chart reflectance form, a new optional request option and new result fields, with nothing removed and no breaking change to the 2.x API. Photivra's own colour patches for a colour test chart (#537), and grey-card (incident) exposure: the deviation from an 18 % grey card's standard exposure, and grey-card metering for the automatic modes (#538). Both are for the app's Beta charts.
- **Results:** in 22 fingerprinted results against the published 2.13.0, every typed array (100) and every other field is identical, leaving out only timings and the two new exposure fields ([Results against 2.13.0](#results-against-2130)).

## Scope

Every pull request merged since `v2.13.0` (`9c3fe85`), and this record:

| Change | Pull request |
| --- | --- |
| Chart scenes: built-in Photivra colour patches with spectral reflectance | #537 |
| Exposure: grey-card (incident) deviation and grey-card metering | #538 |
| 2.14.0 release preparation: version, changelog, this record, and the 2.13.0 publication record | this pull request |

The full entries, with their tests and measurements, are in [CHANGELOG.md](../CHANGELOG.md) under 2.14.0.

## What changed, with evidence

### New

- **Colour patches designed by Photivra (#537).** 30 reflectance spectra in six groups:
  - a six-step flat neutral ramp;
  - strong and soft red, yellow, green, cyan, blue and magenta;
  - four skin tones;
  - six memory colours;
  - a deep orange and a deep violet near the sRGB edge.

  Each is an analytic function: a constant plus Gaussian and logistic terms on 360–830 nm, published in full in [Colour patches](COLOR_PATCHES.md). No third-party chart data, names, order, layout or spectra are used.
  - **API:** the chart reflectance `{ kind: "color-patch", patchId }`, the `color-patches` preset, `getColorPatchSet()` and `evaluateColorPatchReflectance()`.
  - **Reference CIELAB (D65, CIE 1931 2°) and sRGB:** computed by `scripts/compute-color-patch-reference.mjs`, which downloads the CIE tables, checks their SHA-256 and deletes them.
  - **Tests:** `test/color-patches.test.ts`, 19 tests:
    - the formula and its unused clamp;
    - the neutral L* in closed form;
    - neutrality after white balance under the 6500 K Planckian and illuminant A;
    - hue order;
    - rendered CIELAB within ΔE00 1.35 of the published values under the 6500 K Planckian;
    - digest locks of existing charts against 2.13.0.

    Under the CIE D65 table as a caller illuminant, the render is within ΔE00 0.20 at 1 nm and 0.26 at 5 nm (`--render`).
- **Grey-card exposure (#538).** `exposure.greyCardDeviationStops` = log₂(L_ref/(0.18·E/π)), the deviation from the CIPA DC-004-2020 standard exposure of an 18 % Lambertian grey card under the request's illuminance. It is exactly 0 at the defaults and does not depend on the scene's reflectances.
  - **Metering option:** `exposure.metering: "scene-average" | "grey-card"`, defaulting to the unchanged scene meter. With `"grey-card"` the automatic modes and Auto ISO meter that card and land on a grey-card deviation of 0, up to their steps and limits; the remainder under Auto ISO equals the report's `residualStops`.
  - **Reporting:** the capture and the display view report both fields.
  - **Tests:** `test/exposure-grey-card.test.ts`, 11 tests.

### Known

- At the default `sensor.spectralStepNanometers` (20 nm), the scene-illuminant white balance is measured on 1 nm nodes while the sensor integrates on 20 nm nodes, which leaves a small neutral cast. White a* 0.17, b* 0.36 under the 6500 K Planckian. It is below 0.03 with 5 nm nodes. This is unchanged from 2.13.0 and recorded in the CHANGELOG.

## Results against 2.13.0

22 whole results were rendered with the published `@photivra/engine@2.13.0` (npm tarball) and with this candidate's build, on Node 24.19.0 (Apple silicon, arm64). The engine version was normalized: the 2.13.0 copy's `ENGINE_API_VERSION` was set to 2.14.0, so the DNG Software tag and the provenance match.

The 22 results are the same set as 2.13.0's record:

- **15 `simulateCapture` requests** (96 × 64). They cover:
  - the step wedge, the slanted edge and the Siemens star;
  - manual, aperture priority, shutter priority, and program with −1 stop compensation;
  - ISO 1600;
  - JPEG, 16-bit PNG and DNG;
  - a fixed 3200 K white balance;
  - a 2856 K Planckian at 100 lx;
  - diffraction at f/16;
  - a region;
  - AHD.
- **One `simulateIdealReference`.**
- **Six `simulateDisplayView` views at 48 × 32:**
  - the Siemens star with the bilinear demosaic, twice;
  - the Siemens star with AHD;
  - the Siemens star with Quality options (diffraction, four-spot filter, AHD);
  - the step wedge with AHD;
  - the slanted edge with AHD.

Every typed array was hashed with SHA-256. Everything else was compared as JSON, with timings removed and only the new `exposure.greyCardDeviationStops` and `exposure.metering` left out.

| Results | Arrays | Other fields |
| --- | --- | --- |
| All 22 | **identical** (100 of 100) | **identical** |

**Why nothing changes:** the new options change nothing when absent. With `exposure.metering` omitted, no assumption is added. The patch spectra are used only when a chart names them. #537 and #538 each also compared their own cases against a 2.13.0 build:
- the app's chart layouts as captures and a display view (#537);
- four exposure modes and a display view on the app's round 4 All-in-one chart (#538).

## Compatibility

- **Root exports: 1,796** (2.13.0: 1,780). These 16 are new, and none is removed or changed in name, source or kind (`docs/api/exports.json` compared with `v2.13.0`'s):
  - **Functions:** `getColorPatchSet` and `evaluateColorPatchReflectance`.
  - **Constants:** `COLOR_PATCH_IDS`, `COLOR_PATCH_SET_ID`, `COLOR_PATCH_SET_VERSION`, `COLOR_PATCH_WAVELENGTH_RANGE_NANOMETERS` and `SIMULATE_CAPTURE_METERING_MODES`.
  - **Types:** `ColorPatch`, `ColorPatchGroup`, `ColorPatchId`, `ColorPatchReflectance`, `ColorPatchSet`, `ColorPatchSpectralTerm`, `ColorPatchesChartScene`, `EvaluateColorPatchReflectanceInput` and `SimulateCaptureMetering`.
- **Inputs and results:**
  - `ChartReflectance` and `ChartElementScene` gain a member.
  - `CHART_SCENE_PRESETS` and `CHART_SCENE_DEFAULTS` gain `color-patches`.
  - `exposure.metering` is a new optional input.
  - The capture's and the display view's `exposure` gain `greyCardDeviationStops` and `metering`.
  - No field is removed or retyped.
- **Widened union:** code with an exhaustive `switch` over `ChartScenePresetId` or `ChartReflectance` will need the new cases when it updates.
- **No default changes:** captures, RAW codes, files, display views and assumptions are the same for the same request.

## Rights and licensing

No third-party code or dependencies are added.

- **Colour patches:** the spectra are Photivra's own design. Their reference values are computed from the CIE D65 and CIE 1931 tables at computation time only; nothing from the tables is stored. The use is recorded in `THIRD_PARTY.md`, as for the CMF fit.
- **Grey-card exposure:** uses CIPA DC-004-2020 (free), already the engine's exposure reference.

## Privacy and security

No network, persistence or telemetry is added to the package. The reference script, which is repository-only and not packed, downloads the two CIE tables when it is run.

## Release gates

1. **GitHub CI** on the exact commit that is tagged (the `main` commit that merges this record). Tag it only when its CI is green.
2. **Hardware acceptance:** not applicable. `src/gpu/` is unchanged since `v2.13.0` (`git diff v2.13.0 -- src/gpu` is empty). The `color-patches` preset reuses the `patches` geometry in the WebGPU chart stage.

## Remaining release checklist

- [x] #537 and #538 merged with their changelog entries.
- [x] Version surfaces aligned at 2.14.0 (`npm run release:prepare -- 2.14.0`). Root exports 1,796.
- [x] Fingerprint against the published 2.13.0: all 22 results identical (above).
- [x] 2.13.0 recorded as published (`CHANGELOG.md`, `SECURITY.md`, [its record](RELEASE_2_13_0.md)); the 2.12.0 record's release-notes item ticked.
- [x] The owner's approval to tag and release 2.14.0 (chat, November 1, 2026).
- [ ] Green CI on this pull request, then on `main` after merge.
- [ ] The `v2.14.0` tag on the `main` commit that merges this record.
- [ ] After publication: npm version, dist-tag, integrity and provenance verified; GitHub release notes published; publication dates updated in `CHANGELOG.md`, `README.md`, `SECURITY.md`, `docs/DEVELOPERS.md` and this record.
