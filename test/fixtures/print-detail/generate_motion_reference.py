# SPDX-License-Identifier: Apache-2.0
"""Owned constant-depth grating truth, independent of engine imports.

Finite midpoint transfer uses a closed geometric series rather than evaluating
engine quadrature nodes. Continuous exposure truth supplies convergence target.
Visibility is stipulated constant; this does not qualify occlusion transitions.
"""
import json
import math
from pathlib import Path

cases = []
for depth in (2, 5, 10):
    for camera, subject in ((1, 0), (0, 1), (1, 1)):
        for nodes in (2, 4, 8, 16, 32):
            projection_mm = 50 * 5000 / (5000 - 50)
            velocity_mm_s = projection_mm * (subject - camera) / depth
            phase_span = 2 * math.pi * .25 * velocity_mm_s * .02
            finite = 1 if phase_span == 0 else abs(math.sin(phase_span / 2) / (nodes * math.sin(phase_span / (2 * nodes))))
            continuous = 1 if phase_span == 0 else abs(math.sin(phase_span / 2) / (phase_span / 2))
            cases.append(dict(depthM=depth, cameraVelocityMps=camera, subjectVelocityMps=subject,
                temporalSampleCount=nodes, expectedModulation=.5 * finite,
                continuousExposureModulation=.5 * continuous))
record = dict(schemaVersion="0.1.0", ownership="photivra-owned", source="generate_motion_reference.py",
    domain=dict(exposureSeconds=.02, focalLengthMm=50, focusDistanceM=5, frequencyCyclesPerMm=.25,
        visibility="constant-visible-plane-interior", depth="constant per selected plane", signal="neutral relative linear"),
    qualification="independent finite quadrature and continuous-exposure reference; no device calibration or occlusion qualification",
    cases=cases)
Path(__file__).with_name("motion-backend-reference.json").write_text(json.dumps(record, indent=2) + "\n")
