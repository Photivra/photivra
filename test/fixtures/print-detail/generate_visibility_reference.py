# SPDX-License-Identifier: Apache-2.0
"""Independent exact ray/interval truth for an owned moving foreground edge.

No engine imports. Static camera, two frontoparallel emitting planes, no PSF.
The near half-plane translates horizontally; the far plane remains visible
where the near plane is absent. This is source visibility, not renderer DOF.
"""
from fractions import Fraction as F
import json
from pathlib import Path

projection_mm = F(50 * 5000, 5000 - 50)
depth_m, duration, start_m, speed_m_s = F(2), F(8, 1000), F(-1, 2), F(125)
near_scale, far_scale = F(1, 2), F(3, 2)
cases = []
for axis in ("x", "y"):
    for count in (2, 4, 8, 16, 32, 64, 128):
        sites = []
        for site in range(4):
            coordinate_mm = F(-9 if site % 2 == 0 else 9) if axis == "x" else F(-6 if site < 2 else 6)
            finite, continuous = F(0), F(0)
            near_counts = []
            # Native Y points down; outgoing/world reference Y points up.
            offset = F(1, 5) if axis == "x" else F(3, 20)
            for delta_mm in (-offset, offset):
                ray_x_m = (coordinate_mm + delta_mm) * depth_m / projection_mm * (1 if axis == "x" else -1)
                transition = (ray_x_m - start_m) / speed_m_s
                fraction = max(F(0), min(F(1), 1 - transition / duration))
                near_count = sum(ray_x_m <= start_m + speed_m_s * duration * F(2 * i + 1, 2 * count) for i in range(count))
                near_counts.append(near_count)
                # Equal vertical nodes see the same edge, so two x nodes suffice.
                finite += (far_scale + (near_scale - far_scale) * F(near_count, count)) / 2
                continuous += (far_scale + (near_scale - far_scale) * fraction) / 2
            sites.append(dict(siteIndex=site, finiteRadianceScale=float(finite),
                continuousRadianceScale=float(continuous), foregroundCountsByAxis=near_counts))
        cases.append(dict(motionAxis=axis, temporalSampleCount=count, sites=sites,
            maximumAbsoluteRadianceScaleError=float(abs(near_scale-far_scale)/count)))
record = dict(schemaVersion="0.1.0", ownership="photivra-owned",
    reference="exact rational ray-plane intersection, visibility interval and midpoint occupancy",
    domain=dict(nativeRaster=[2,2], imagingAreaMm=[36,24], focalLengthMm=50, focusDistanceM=5,
        nearPlaneDepthM=2, farPlaneDepthM=10, foregroundEdgeStartM=-.5, foregroundMotionAxes=["x","y"],
        foregroundVelocityMps=125, exposureSeconds=.008, nearRadianceScale=.5,
        farRadianceScale=1.5, apertureMicrometers=[800,600], apertureSamplesPerAxis=2,
        coordinateConvention="native X right; outgoing ray points toward camera; near edge occupies world declared-axis coordinate <= edge(time)",
        optics="explicit point optics with geometric aperture, no PSF/defocus/correction",
        calibration="owned computational provider only; no private renderer or physical device"), cases=cases)
Path(__file__).with_name("visibility-backend-reference.json").write_text(json.dumps(record,indent=2)+"\n")
