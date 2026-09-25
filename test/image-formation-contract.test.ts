import { describe, expect, it } from "vitest";

import {
  IMAGE_FORMATION_CONTRACT_VERSION,
  getImageFormationContract,
  type ImageFormationStageId
} from "../src/core/image-formation.js";

function assertAcyclicRequiredDependencies(
  stages: ReturnType<typeof getImageFormationContract>["stages"]
): void {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const visiting = new Set<ImageFormationStageId>();
  const visited = new Set<ImageFormationStageId>();

  const visit = (id: ImageFormationStageId): void => {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      throw new Error(`Cycle detected at image-formation stage ${id}.`);
    }

    visiting.add(id);
    const stage = byId.get(id);
    if (stage === undefined) {
      throw new Error(`Missing image-formation stage ${id}.`);
    }
    for (const upstream of stage.requiredUpstreamStages) {
      visit(upstream);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const stage of stages) {
    visit(stage.id);
  }
}

describe("image-formation contract", () => {
  it("publishes the five scientific domains without claiming a simple filter chain", () => {
    const contract = getImageFormationContract();

    expect(contract.version).toBe(IMAGE_FORMATION_CONTRACT_VERSION);
    expect(contract.version).toBe("0.1.0");
    expect(contract.domains).toEqual([
      "scene-ray-geometry",
      "lens-pupil-throughput",
      "field-wavelength-psf",
      "temporal-exposure-readout",
      "sensor-output-display"
    ]);
    expect(contract.notes.join(" ")).toContain(
      "dependency/ownership graph"
    );
    expect(contract.notes.join(" ")).toContain(
      "not a claim that every physical interaction"
    );
  });

  it("keeps stage IDs unique, dependencies acyclic, and all references declared", () => {
    const contract = getImageFormationContract();
    const ids = contract.stages.map((stage) => stage.id);
    const idSet = new Set(ids);

    expect(idSet.size).toBe(ids.length);

    for (const stage of contract.stages) {
      expect(contract.domains).toContain(stage.domain);
      expect(stage.coordinateSpaces.length).toBeGreaterThan(0);

      for (const coordinateSpace of stage.coordinateSpaces) {
        expect(
          contract.coordinateSpaces.some((space) => space.id === coordinateSpace)
        ).toBe(true);
      }
      for (const upstream of stage.requiredUpstreamStages) {
        expect(idSet.has(upstream)).toBe(true);
        expect(upstream).not.toBe(stage.id);
      }
      for (const coupled of stage.coupledStages) {
        expect(idSet.has(coupled)).toBe(true);
        expect(coupled).not.toBe(stage.id);
      }
    }

    expect(() => assertAcyclicRequiredDependencies(contract.stages)).not.toThrow();
  });

  it("preserves established image-plane and raster coordinate conventions", () => {
    const contract = getImageFormationContract();
    const imagePlane = contract.coordinateSpaces.find(
      (space) => space.id === "image-plane-metric"
    );
    const nativeRaster = contract.coordinateSpaces.find(
      (space) => space.id === "native-raster"
    );
    const oriented = contract.coordinateSpaces.find(
      (space) => space.id === "oriented-capture-raster"
    );

    expect(imagePlane).toMatchObject({
      unit: "mm",
      origin: "optical axis",
      axes: "+X right, +Y up"
    });
    expect(nativeRaster).toMatchObject({
      unit: "px",
      origin: "top-left of the native effective image raster"
    });
    expect(nativeRaster?.axes).toContain("+Y down");
    expect(nativeRaster?.note).toContain(
      "invariant under physical camera rotation"
    );
    expect(oriented?.note).toContain(
      "never redefines native readout direction"
    );
  });

  it("places coupled lens effects in the correct scientific domains", () => {
    const contract = getImageFormationContract();
    const byEffect = new Map(
      contract.effectPlacements.map((effect) => [effect.id, effect])
    );

    expect(byEffect.get("focus-breathing")).toMatchObject({
      primaryStage: "lens-field-pupil-evaluation",
      coupledStages: ["scene-ray-projection"]
    });
    expect(byEffect.get("geometric-distortion")).toMatchObject({
      primaryStage: "lens-field-pupil-evaluation"
    });
    expect(byEffect.get("lateral-chromatic-aberration")).toMatchObject({
      primaryStage: "lens-field-pupil-evaluation",
      coupledStages: ["field-wavelength-psf"]
    });
    expect(byEffect.get("illumination-vignetting")).toMatchObject({
      primaryStage: "lens-field-pupil-evaluation",
      coupledStages: []
    });
    expect(byEffect.get("mechanical-vignetting")).toMatchObject({
      primaryStage: "lens-field-pupil-evaluation",
      coupledStages: ["field-wavelength-psf"]
    });
    expect(byEffect.get("non-circular-diffraction")).toMatchObject({
      primaryStage: "field-wavelength-psf",
      coupledStages: ["lens-field-pupil-evaluation"]
    });
  });

  it("keeps temporal motion/readout time-parameterized and distinct from exposure duration", () => {
    const contract = getImageFormationContract();
    const byEffect = new Map(
      contract.effectPlacements.map((effect) => [effect.id, effect])
    );

    expect(contract.temporal).toEqual(
      expect.objectContaining({
        authoritativeTimeUnit: "s",
        origin: "exposure-start",
        normalizedTimeIsDerivedOnly: true,
        exposureDurationAndReadoutTimingAreIndependent: true,
        globalReadoutDoesNotImplyZeroMotionBlur: true,
        nativeReadoutDirectionRemainsNativeUnderOrientation: true
      })
    );
    expect(byEffect.get("spatial-camera-rotation")).toMatchObject({
      primaryStage: "temporal-exposure-readout",
      coupledStages: ["scene-ray-projection"]
    });
    expect(byEffect.get("spatial-camera-rotation")?.note).toContain(
      "depth-dependent camera translation is outside"
    );
    expect(byEffect.get("rolling-readout")).toMatchObject({
      primaryStage: "temporal-exposure-readout",
      coupledStages: [
        "photosite-cfa-sampling",
        "physical-orientation-transform"
      ]
    });
  });

  it("reserves the future sensor pipeline without claiming it is implemented", () => {
    const contract = getImageFormationContract();
    const byStage = new Map(contract.stages.map((stage) => [stage.id, stage]));

    expect(byStage.get("sensor-optical-stack")?.status).toBe(
      "reserved-contract"
    );
    expect(byStage.get("photosite-cfa-sampling")?.status).toBe(
      "reserved-contract"
    );
    expect(byStage.get("sensor-charge-statistics")?.requiredUpstreamStages).toEqual([
      "photosite-cfa-sampling",
      "temporal-exposure-readout"
    ]);
    expect(byStage.get("read-noise-conversion")?.requiredUpstreamStages).toEqual([
      "sensor-charge-statistics"
    ]);
    expect(byStage.get("adc-quantization")?.requiredUpstreamStages).toEqual([
      "read-noise-conversion"
    ]);
    expect(byStage.get("reconstruction")?.requiredUpstreamStages).toEqual([
      "adc-quantization"
    ]);
  });

  it("requires inverse warp sampling and stable alpha/occlusion semantics", () => {
    const contract = getImageFormationContract();

    expect(contract.renderer).toEqual(
      expect.objectContaining({
        geometricWarpSampling: "inverse-map-destination-to-source",
        alphaRepresentation: "premultiplied",
        occlusionRule: "preserve-depth-order-across-warps",
        previewAndReferenceShareScientificContract: true,
        backendMayApproximateButNotRedefineSemantics: true
      })
    );
  });

  it("returns independent copies so callers cannot mutate future reads", () => {
    const first = getImageFormationContract();
    const second = getImageFormationContract();

    expect(first).not.toBe(second);
    expect(first.stages).not.toBe(second.stages);
    expect(first.effectPlacements).not.toBe(second.effectPlacements);

    const mutableStages = first.stages as unknown as Array<{ purpose: string }>;
    mutableStages[0]!.purpose = "mutated by caller";

    expect(getImageFormationContract().stages[0]?.purpose).not.toBe(
      "mutated by caller"
    );
  });
});
