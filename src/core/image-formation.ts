// SPDX-License-Identifier: Apache-2.0

/**
 * Version of the public image-formation ordering contract.
 *
 * This version is independent from package, root-engine, and composed-POC
 * versions. It describes semantic ownership/order only; it does not imply that
 * every reserved stage is implemented.
 */
export const IMAGE_FORMATION_CONTRACT_VERSION = "0.2.0" as const;

export type ImageFormationDomainId =
  | "scene-ray-geometry"
  | "lens-pupil-throughput"
  | "field-wavelength-psf"
  | "temporal-exposure-readout"
  | "sensor-output-display";

export type ImageFormationCoordinateSpaceId =
  | "scene-metric"
  | "image-plane-metric"
  | "native-sensor-physical"
  | "native-raster"
  | "oriented-capture-raster"
  | "output-raster"
  | "display";

export type ImageFormationStageId =
  | "scene-ray-projection"
  | "lens-field-pupil-evaluation"
  | "field-wavelength-psf"
  | "temporal-exposure-readout"
  | "sensor-optical-stack"
  | "photosite-cfa-sampling"
  | "sensor-charge-statistics"
  | "read-noise-conversion"
  | "adc-quantization"
  | "reconstruction"
  | "physical-orientation-transform"
  | "output-crop-resample"
  | "display-processing";

export type ImageFormationImplementationStatus =
  | "existing-foundation"
  | "partial-foundation"
  | "reserved-contract";

export type ImageFormationEffectId =
  | "focus-breathing"
  | "geometric-distortion"
  | "lateral-chromatic-aberration"
  | "illumination-vignetting"
  | "mechanical-vignetting"
  | "non-circular-diffraction"
  | "field-curvature"
  | "field-sharpness-falloff"
  | "field-dependent-bokeh"
  | "spatial-camera-rotation"
  | "rolling-readout"
  | "photosite-cfa-sampling"
  | "photon-charge-statistics"
  | "read-noise-conversion"
  | "demosaic-remosaic";

export interface ImageFormationCoordinateSpaceContract {
  id: ImageFormationCoordinateSpaceId;
  unit: "m" | "mm" | "px" | "display-dependent";
  origin: string;
  axes: string;
  note: string;
}

export interface ImageFormationStageContract {
  id: ImageFormationStageId;
  domain: ImageFormationDomainId;
  status: ImageFormationImplementationStatus;
  coordinateSpaces: readonly ImageFormationCoordinateSpaceId[];
  requiredUpstreamStages: readonly ImageFormationStageId[];
  coupledStages: readonly ImageFormationStageId[];
  purpose: string;
}

export interface ImageFormationEffectPlacement {
  id: ImageFormationEffectId;
  primaryStage: ImageFormationStageId;
  coupledStages: readonly ImageFormationStageId[];
  note: string;
}

export interface ImageFormationTemporalContract {
  authoritativeTimeUnit: "s";
  origin: "exposure-start";
  normalizedTimeIsDerivedOnly: true;
  exposureDurationAndReadoutTimingAreIndependent: true;
  globalReadoutDoesNotImplyZeroMotionBlur: true;
  nativeReadoutDirectionRemainsNativeUnderOrientation: true;
  note: string;
}

export interface ImageFormationRendererContract {
  geometricWarpSampling: "inverse-map-destination-to-source";
  alphaRepresentation: "premultiplied";
  occlusionRule: "preserve-depth-order-across-warps";
  previewAndReferenceShareScientificContract: true;
  backendMayApproximateButNotRedefineSemantics: true;
  note: string;
}

export interface ImageFormationContract {
  version: typeof IMAGE_FORMATION_CONTRACT_VERSION;
  domains: readonly ImageFormationDomainId[];
  coordinateSpaces: readonly ImageFormationCoordinateSpaceContract[];
  stages: readonly ImageFormationStageContract[];
  effectPlacements: readonly ImageFormationEffectPlacement[];
  temporal: ImageFormationTemporalContract;
  renderer: ImageFormationRendererContract;
  notes: readonly string[];
}

const DOMAINS = [
  "scene-ray-geometry",
  "lens-pupil-throughput",
  "field-wavelength-psf",
  "temporal-exposure-readout",
  "sensor-output-display"
] as const satisfies readonly ImageFormationDomainId[];

const COORDINATE_SPACES = [
  {
    id: "scene-metric",
    unit: "m",
    origin: "scene/camera model defined by the scene or projection contract",
    axes: "scene/world axes remain owned by the scene/projection contract",
    note: "Do not reinterpret scene axes as raster axes."
  },
  {
    id: "image-plane-metric",
    unit: "mm",
    origin: "optical axis",
    axes: "+X right, +Y up",
    note: "This preserves the legacy projected-motion/image-plane convention."
  },
  {
    id: "native-sensor-physical",
    unit: "mm",
    origin: "optical axis",
    axes: "+X right, +Y down in native sensor-facing coordinates",
    note: "Physical sensor coordinates remain invariant under camera orientation."
  },
  {
    id: "native-raster",
    unit: "px",
    origin: "top-left of the native effective image raster",
    axes: "+X right, +Y down; rectangles use half-open integer extents",
    note: "Native coordinates remain invariant under physical camera rotation."
  },
  {
    id: "oriented-capture-raster",
    unit: "px",
    origin: "top-left after the explicit physical-orientation transform",
    axes: "+X right, +Y down",
    note: "This is derived from native coordinates; it never redefines native readout direction."
  },
  {
    id: "output-raster",
    unit: "px",
    origin: "top-left of the declared output raster",
    axes: "+X right, +Y down",
    note: "Digital crop/resampling does not mutate physical sensor identity."
  },
  {
    id: "display",
    unit: "display-dependent",
    origin: "consumer/display contract",
    axes: "consumer/display contract",
    note: "Display/tone/UI coordinates are not authoritative camera-science coordinates."
  }
] as const satisfies readonly ImageFormationCoordinateSpaceContract[];

const STAGES = [
  {
    id: "scene-ray-projection",
    domain: "scene-ray-geometry",
    status: "existing-foundation",
    coordinateSpaces: ["scene-metric", "image-plane-metric"],
    requiredUpstreamStages: [],
    coupledStages: ["temporal-exposure-readout"],
    purpose:
      "Project scene geometry into the optical image plane while preserving explicit metric geometry and focus-aware projection."
  },
  {
    id: "lens-field-pupil-evaluation",
    domain: "lens-pupil-throughput",
    status: "partial-foundation",
    coordinateSpaces: ["image-plane-metric", "native-sensor-physical"],
    requiredUpstreamStages: ["scene-ray-projection"],
    coupledStages: ["field-wavelength-psf"],
    purpose:
      "Own focus-dependent framing, geometric field mapping, wavelength/channel field mapping, illumination throughput, and pupil clipping inputs."
  },
  {
    id: "field-wavelength-psf",
    domain: "field-wavelength-psf",
    status: "partial-foundation",
    coordinateSpaces: ["image-plane-metric", "native-sensor-physical"],
    requiredUpstreamStages: ["lens-field-pupil-evaluation"],
    coupledStages: ["temporal-exposure-readout"],
    purpose:
      "Own field-, depth-, pupil-, and wavelength-dependent point-spread behavior including defocus and diffraction without collapsing independent effects into one undocumented blur scalar."
  },
  {
    id: "temporal-exposure-readout",
    domain: "temporal-exposure-readout",
    status: "partial-foundation",
    coordinateSpaces: ["scene-metric", "image-plane-metric", "native-raster"],
    requiredUpstreamStages: [
      "scene-ray-projection",
      "lens-field-pupil-evaluation",
      "field-wavelength-psf"
    ],
    coupledStages: ["photosite-cfa-sampling"],
    purpose:
      "Evaluate time-dependent scene/camera mapping over exposure windows and reserve independent native-sensor readout scheduling for rolling/global capture."
  },
  {
    id: "sensor-optical-stack",
    domain: "sensor-output-display",
    status: "reserved-contract",
    coordinateSpaces: ["native-sensor-physical"],
    requiredUpstreamStages: ["field-wavelength-psf"],
    coupledStages: ["photosite-cfa-sampling"],
    purpose:
      "Reserve optical low-pass filter, cover-glass, and microlens behavior before photosite/color sampling."
  },
  {
    id: "photosite-cfa-sampling",
    domain: "sensor-output-display",
    status: "reserved-contract",
    coordinateSpaces: ["native-sensor-physical", "native-raster"],
    requiredUpstreamStages: ["sensor-optical-stack"],
    coupledStages: ["temporal-exposure-readout"],
    purpose:
      "Reserve photosite/CFA spatial sampling while keeping native sensor coordinates and readout timing explicit."
  },
  {
    id: "sensor-charge-statistics",
    domain: "sensor-output-display",
    status: "partial-foundation",
    coordinateSpaces: ["native-raster"],
    requiredUpstreamStages: [
      "photosite-cfa-sampling",
      "temporal-exposure-readout"
    ],
    coupledStages: [],
    purpose:
      "Reserve photon/electron integration and shot-statistics semantics separately from later electronic read noise."
  },
  {
    id: "read-noise-conversion",
    domain: "sensor-output-display",
    status: "partial-foundation",
    coordinateSpaces: ["native-raster"],
    requiredUpstreamStages: ["sensor-charge-statistics"],
    coupledStages: [],
    purpose:
      "Reserve electronic read-noise and conversion behavior independently from photon shot statistics."
  },
  {
    id: "adc-quantization",
    domain: "sensor-output-display",
    status: "reserved-contract",
    coordinateSpaces: ["native-raster"],
    requiredUpstreamStages: ["read-noise-conversion"],
    coupledStages: [],
    purpose:
      "Reserve analog-to-digital conversion, clipping, and quantization after sensor/electronic signal formation."
  },
  {
    id: "reconstruction",
    domain: "sensor-output-display",
    status: "reserved-contract",
    coordinateSpaces: ["native-raster"],
    requiredUpstreamStages: ["adc-quantization"],
    coupledStages: [],
    purpose:
      "Reserve demosaic/remosaic, binning-aware reconstruction, pixel-shift combination, and related capture-mode processing."
  },
  {
    id: "physical-orientation-transform",
    domain: "sensor-output-display",
    status: "existing-foundation",
    coordinateSpaces: ["native-raster", "oriented-capture-raster"],
    requiredUpstreamStages: ["reconstruction"],
    coupledStages: ["temporal-exposure-readout"],
    purpose:
      "Transform reconstructed native-raster coordinates into oriented capture coordinates without redefining native sensor/readout coordinates. The coordinate transform primitive already exists independently; this dependency reserves its full-pipeline placement."
  },
  {
    id: "output-crop-resample",
    domain: "sensor-output-display",
    status: "existing-foundation",
    coordinateSpaces: ["oriented-capture-raster", "output-raster"],
    requiredUpstreamStages: ["physical-orientation-transform"],
    coupledStages: [],
    purpose:
      "Apply digital/output crop and resampling while preserving physical capture identity and explicit axis-aware scale."
  },
  {
    id: "display-processing",
    domain: "sensor-output-display",
    status: "reserved-contract",
    coordinateSpaces: ["output-raster", "display"],
    requiredUpstreamStages: ["output-crop-resample"],
    coupledStages: [],
    purpose:
      "Reserve tone/display/output processing after camera-science geometry and sampling; this stage must not redefine upstream physical quantities."
  }
] as const satisfies readonly ImageFormationStageContract[];

const EFFECT_PLACEMENTS = [
  {
    id: "focus-breathing",
    primaryStage: "lens-field-pupil-evaluation",
    coupledStages: ["scene-ray-projection"],
    note:
      "Focus breathing changes projection/magnification and must not be implemented as post-output crop or display scaling."
  },
  {
    id: "geometric-distortion",
    primaryStage: "lens-field-pupil-evaluation",
    coupledStages: [],
    note: "Distortion is a field-coordinate mapping, not a blur."
  },
  {
    id: "lateral-chromatic-aberration",
    primaryStage: "lens-field-pupil-evaluation",
    coupledStages: ["field-wavelength-psf"],
    note:
      "Lateral CA is wavelength/channel-dependent field mapping; wavelength-aware PSF models may share the same spectral basis."
  },
  {
    id: "illumination-vignetting",
    primaryStage: "lens-field-pupil-evaluation",
    coupledStages: [],
    note:
      "Illumination vignetting changes field-dependent throughput only and is distinct from pupil clipping."
  },
  {
    id: "mechanical-vignetting",
    primaryStage: "lens-field-pupil-evaluation",
    coupledStages: ["field-wavelength-psf"],
    note:
      "Mechanical/pupil clipping changes both throughput and the effective pupil/PSF, including cat's-eye bokeh."
  },
  {
    id: "non-circular-diffraction",
    primaryStage: "field-wavelength-psf",
    coupledStages: ["lens-field-pupil-evaluation"],
    note:
      "Non-circular diffraction consumes an explicit pupil representation; preserve the current circular Airy result as a separate model."
  },
  {
    id: "field-curvature",
    primaryStage: "field-wavelength-psf",
    coupledStages: [],
    note: "Field curvature is field-dependent focus/PSF behavior, not geometric distortion."
  },
  {
    id: "field-sharpness-falloff",
    primaryStage: "field-wavelength-psf",
    coupledStages: [],
    note:
      "Field sharpness must be represented through a defensible field-dependent PSF or related optical model, not a synthetic quality score."
  },
  {
    id: "field-dependent-bokeh",
    primaryStage: "field-wavelength-psf",
    coupledStages: ["lens-field-pupil-evaluation"],
    note:
      "Field-dependent bokeh may depend on pupil clipping and field position; do not collapse it into aperture blade count alone."
  },
  {
    id: "spatial-camera-rotation",
    primaryStage: "temporal-exposure-readout",
    coupledStages: ["scene-ray-projection"],
    note:
      "Rotation should be evaluable as a time-parameterized mapping; depth-dependent camera translation is outside the initial rotation model."
  },
  {
    id: "rolling-readout",
    primaryStage: "temporal-exposure-readout",
    coupledStages: ["photosite-cfa-sampling", "physical-orientation-transform"],
    note:
      "Readout timing is native-sensor timing. Physical orientation changes how native scan direction maps to the scene but does not redefine native coordinates."
  },
  {
    id: "photosite-cfa-sampling",
    primaryStage: "photosite-cfa-sampling",
    coupledStages: ["sensor-optical-stack", "temporal-exposure-readout"],
    note:
      "CFA/photosite sampling follows the sensor optical stack and participates in the declared exposure/readout schedule."
  },
  {
    id: "photon-charge-statistics",
    primaryStage: "sensor-charge-statistics",
    coupledStages: [],
    note:
      "Photon/charge statistics remain separate from electronic read noise and require explicit radiometric prerequisites."
  },
  {
    id: "read-noise-conversion",
    primaryStage: "read-noise-conversion",
    coupledStages: [],
    note:
      "Electronic read noise/conversion is downstream of charge formation and must not alter photon shot-noise semantics."
  },
  {
    id: "demosaic-remosaic",
    primaryStage: "reconstruction",
    coupledStages: ["photosite-cfa-sampling"],
    note:
      "Reconstruction consumes declared capture-mode/CFA sampling rather than redefining the native photosite layout."
  }
] as const satisfies readonly ImageFormationEffectPlacement[];

const TEMPORAL = {
  authoritativeTimeUnit: "s",
  origin: "exposure-start",
  normalizedTimeIsDerivedOnly: true,
  exposureDurationAndReadoutTimingAreIndependent: true,
  globalReadoutDoesNotImplyZeroMotionBlur: true,
  nativeReadoutDirectionRemainsNativeUnderOrientation: true,
  note:
    "Time-parameterized optical/camera mapping should be evaluated in seconds from exposure start. A normalized [0,1] parameter may be derived for algorithms but is not the authoritative physical time. Rolling/global readout timing is separate from local exposure duration."
} as const satisfies ImageFormationTemporalContract;

const RENDERER = {
  geometricWarpSampling: "inverse-map-destination-to-source",
  alphaRepresentation: "premultiplied",
  occlusionRule: "preserve-depth-order-across-warps",
  previewAndReferenceShareScientificContract: true,
  backendMayApproximateButNotRedefineSemantics: true,
  note:
    "Renderer implementations may use bounded preview approximations or higher-fidelity reference evaluation, but both consume the same engine-owned parameters. Geometric warps should inverse-sample destination locations to avoid forward-warp holes, preserve premultiplied-alpha semantics, and must not reorder scene occlusion merely because a field warp is applied."
} as const satisfies ImageFormationRendererContract;

const NOTES = [
  "This contract defines scientific ownership, coordinate semantics, and dependency/coupling boundaries. It does not claim that reserved stages are implemented.",
  "The stage graph is a dependency/ownership graph, not a claim that every physical interaction can be evaluated as one independent serial post-process.",
  "Independent effects may be combined computationally only when the implementation documents mathematical equivalence and preserves the public stage/effect semantics.",
  "Generic/parametric virtual-lens models must remain explicitly generic until defensible calibrated data with compatible reuse rights exists."
] as const;

/**
 * Returns the public image-formation ownership/order contract.
 *
 * The result is descriptive metadata, not a renderer implementation or an
 * assertion that every reserved stage is currently available.
 */
export function getImageFormationContract(): ImageFormationContract {
  return {
    version: IMAGE_FORMATION_CONTRACT_VERSION,
    domains: [...DOMAINS],
    coordinateSpaces: COORDINATE_SPACES.map((space) => ({ ...space })),
    stages: STAGES.map((stage) => ({
      ...stage,
      coordinateSpaces: [...stage.coordinateSpaces],
      requiredUpstreamStages: [...stage.requiredUpstreamStages],
      coupledStages: [...stage.coupledStages]
    })),
    effectPlacements: EFFECT_PLACEMENTS.map((effect) => ({
      ...effect,
      coupledStages: [...effect.coupledStages]
    })),
    temporal: { ...TEMPORAL },
    renderer: { ...RENDERER },
    notes: [...NOTES]
  };
}
