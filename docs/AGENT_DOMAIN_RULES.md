# Photivra engine domain-specific implementation rules

This document and the domain files it lists contain the unchanged, previously binding technical implementation rules moved from the root `AGENTS.md` to reduce irrelevant agent context. The root `AGENTS.md` is the entry point, and these rules **remain binding** for the relevant subsystems and their tests, reviews, documentation and APIs. Consult only relevant headings for a scoped change; consult every affected heading for cross-domain work. This file is not a substitute for the canonical API, scientific, provenance or numerical specifications.

The domain rules are split by scope into the files below, with their text moved verbatim. The scientific-integrity rules in this file apply to every domain. Read this file plus every domain file your change touches.

| Domain | File | Headings |
| --- | --- | --- |
| Sensor, coordinates and capture | [AGENT_DOMAIN_RULES_SENSOR_CAPTURE.md](AGENT_DOMAIN_RULES_SENSOR_CAPTURE.md) | Sensor, capture, and coordinate-system rules; Image-formation contract rules; Production image-formation plan boundary; Production processed-output boundary; Composition boundary; Authoritative linear capture container; Standalone SDR rendering primitives |
| Scene light, exposure and radiometry | [AGENT_DOMAIN_RULES_SCENE_LIGHT_EXPOSURE_RADIOMETRY.md](AGENT_DOMAIN_RULES_SCENE_LIGHT_EXPOSURE_RADIOMETRY.md) | Scene-radiance provider boundary; Shared spectral composition boundary; Temporal illumination boundary; Exposure metering boundary; Scene-radiance metering bridge; Generic equipment exposure-capability boundary; Manual / Auto ISO exposure-control boundary; Aperture Priority exposure-control boundary; Multi-axis priority-mode boundary; Program / Full Auto exposure boundary; Bulb / Time and long-exposure boundary; Meter target / compensation boundary; Scene-radiance → sensor-irradiance optical bridge; Radiometry and sensor-metadata rules |
| Optics and focus | [AGENT_DOMAIN_RULES_OPTICS_FOCUS.md](AGENT_DOMAIN_RULES_OPTICS_FOCUS.md) | PSF/pupil foundation rules; Illumination-vignetting boundary; Lateral-CA boundary; Radial-distortion boundary; Focus-breathing boundary; Standalone stray light and digital corrections |
| Motion and timing | [AGENT_DOMAIN_RULES_MOTION_TIMING.md](AGENT_DOMAIN_RULES_MOTION_TIMING.md) | Production temporal-composition boundary; Spatial camera-rotation boundary |
| Public interfaces and tooling | [AGENT_DOMAIN_RULES_PUBLIC_INTERFACES_TOOLING.md](AGENT_DOMAIN_RULES_PUBLIC_INTERFACES_TOOLING.md) | Public API and compatibility; Runtime and package boundary |

The `Runtime and package boundary` heading formerly also contained the subsections `Standalone stray light and digital corrections` (now in the optics and focus file), `Authoritative linear capture container` and `Standalone SDR rendering primitives` (now in the sensor, coordinates and capture file). They keep their text and continue to bind as runtime and package-boundary rules.

## Scientific integrity

- Use explicit physical units in names and contracts.
- Keep equations, coordinate conventions, assumptions, and valid ranges documented.
- Prefer established analytical relations and independently derived tests.
- Never fabricate calibration values, uncertainty, confidence, error bars, or physical accuracy claims.
- Label results honestly as calculated, calibrated, estimated, or approximation.
- Keep independent physical effects separate unless a documented model justifies combining them.
- Do not claim performance for named commercial cameras, lenses, stabilization systems, or sensors without defensible licensed calibration data.
- Treat public standards, papers, patents, and web references as references, not permission to copy protected expression or data.
