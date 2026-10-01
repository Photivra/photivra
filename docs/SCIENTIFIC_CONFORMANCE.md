# Incremental scientific conformance: #131

The cross-stage conformance layer complements, rather than replaces, narrow unit tests. `test/cross-stage-conformance.test.ts` consumes #130's canonical owned fixture and merged public APIs only. It checks a coherent ideal-focus/projection→FOV/object-size→pixel-motion/defocus path, then controlled one-stop shutter and aperture variants across exposure, motion and diffraction.

Expectations follow independent Gaussian thin-lens reciprocal distance, angular span reconstruction, millimetre/micrometre pixel conversion, shutter-proportional lateral displacement, t/N² relative optical exposure, and wavelength/f-number Airy scaling. Neutral stationary/in-focus states and non-neutral variants preserve calculated provenance. Relative exposure is not photon-count evidence; no source/sensor calibration is inferred.

This first slice is not final engine-wide acceptance and does not close #131. Scene radiance/throughput/metering/sensor and production-composition paths still need cross-stage coverage, followed by the final merged correction/capture/output/export/preset/performance paths. Pending drafts are not imported as main APIs. No runtime behavior, API/schema version, network, Blender or private-app dependency is changed. Final closure remains last under #129 and preserves #16's independent external-file interoperability gate.
