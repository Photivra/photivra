import {
  calculateSensorSpatialSamplingQuadrature,
  type CalculationResult,
  type NativeEffectiveRasterColorSamplingBindingProfile,
  type SensorColorSamplingProfile,
  type SensorOpticalStackProfile,
  type SensorSamplingApertureProfile,
  type SensorSpatialQuadratureNodeValue,
  type SensorSpatialSamplingQuadrature
} from "../../src/index.js";

const evidence = (sourceReference: string) =>
  [{
    sourceOrigin: "photivra" as const,
    sourceReference,
    reuseStatus: "photivra-owned" as const
  }] as const;

export const imagingArea = { widthMm: 4, heightMm: 2 };
export const nativeRaster = { pixelWidth: 4, pixelHeight: 2 };

export const colorProfile = (): SensorColorSamplingProfile => ({
  schemaVersion: "0.1.0",
  profileId: "bayer-like",
  evidence: evidence("test:color"),
  coordinateSystem: "native-sensor-color-sampling-site-index",
  layout: {
    kind: "periodic-mosaic",
    repeatWidthSites: 2,
    repeatHeightSites: 2,
    siteChannelIds: ["red", "green", "green", "blue"],
    anchor: "native-sensor-top-left-site"
  }
});

export const bindingProfile =
(): NativeEffectiveRasterColorSamplingBindingProfile => ({
  schemaVersion: "0.1.0",
  bindingId: "binding",
  colorSamplingProfileId: "bayer-like",
  nativeRaster,
  evidence: evidence("test:binding"),
  relationship: {
    kind: "regular-native-effective-sample-blocks",
    sitesPerNativeSampleX: 1,
    sitesPerNativeSampleY: 1,
    anchor: "shared-native-top-left"
  }
});

export const samplingProfile = (): SensorSamplingApertureProfile => ({
  schemaVersion: "0.1.0",
  profileId: "sampling",
  colorSamplingProfileId: "bayer-like",
  colorSamplingBindingId: "binding",
  evidence: evidence("test:sampling"),
  siteCenterLattice: {
    kind: "regular-rectangular-site-center-lattice",
    coordinateSystem: "native-sensor-physical",
    pitchXMicrometers: 1000,
    pitchYMicrometers: 1000,
    firstSiteCenterFromImagingAreaTopLeftMicrometers: { x: 500, y: 500 },
    evidence: evidence("test:lattice")
  },
  geometricSensitiveAperture: {
    kind: "uniform-axis-aligned-rectangle",
    widthMicrometers: 800,
    heightMicrometers: 600,
    centerOffsetFromSiteCenterMicrometers: { x: 0, y: 0 },
    evidence: evidence("test:aperture")
  }
});

export const absentStack = (): SensorOpticalStackProfile => ({
  schemaVersion: "0.1.0",
  profileId: "absent-aa",
  evidence: evidence("test:stack"),
  effectiveAntiAliasingSpatialResponse: {
    kind: "absent",
    evidence: evidence("test:no-aa")
  }
});

export const splitStack = (): SensorOpticalStackProfile => ({
  schemaVersion: "0.1.0",
  profileId: "split-aa",
  evidence: evidence("test:split-stack"),
  effectiveAntiAliasingSpatialResponse: {
    kind: "normalized-point-splitting-kernel",
    evidence: evidence("test:split"),
    coordinateSystem: "native-sensor-physical",
    scope: "field-wavelength-polarization-invariant-approximation",
    components: [
      { offsetMicrometers: { x: 200, y: 0 }, normalizedWeight: 0.75 },
      { offsetMicrometers: { x: -100, y: 100 }, normalizedWeight: 0.25 }
    ]
  }
});

export function makeQuadrature(
  stack: SensorOpticalStackProfile = absentStack(),
  xCount = 1,
  yCount = 1
): CalculationResult<SensorSpatialSamplingQuadrature> {
  return calculateSensorSpatialSamplingQuadrature({
    imagingArea,
    nativeRaster,
    colorSamplingProfile: colorProfile(),
    colorSamplingBindingProfile: bindingProfile(),
    samplingApertureProfile: samplingProfile(),
    opticalStackProfile: stack,
    site: { x: 1, y: 0 },
    spatialSampleCountX: xCount,
    spatialSampleCountY: yCount
  });
}

export function valuesFor(
  plan: SensorSpatialSamplingQuadrature,
  fn: (index: number) => number
): SensorSpatialQuadratureNodeValue[] {
  return plan.nodes.map((node, index) => ({
    node: {
      antiAliasingComponentIndex: node.antiAliasingComponentIndex,
      apertureSampleXIndex: node.apertureSampleXIndex,
      apertureSampleYIndex: node.apertureSampleYIndex
    },
    value: fn(index)
  }));
}
