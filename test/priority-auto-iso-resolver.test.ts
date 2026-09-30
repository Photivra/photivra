import { describe, expect, it } from "vitest";

import {
  createExposureMeterTargetFromMeteringResult,
  meterRelativeExposure,
  parseExposureMeteringProfile,
  parseGenericBodyExposureCapabilityProfile,
  parseGenericLensExposureCapabilityProfile,
  resolveAperturePriorityAutoIsoExposureMode,
  resolveCaptureGeometry,
  resolveGenericEquipmentExposureCapabilities,
  resolveShutterPriorityExposureMode,
  type ExposureMeterTarget,
  type ResolvedGenericEquipmentExposureCapabilities
} from "../src/index.js";

const evidence = (ref: string) => [{
  sourceOrigin: "photivra" as const,
  sourceReference: ref,
  reuseStatus: "photivra-owned" as const
}] as const;

const capabilities = (options: {
  autoIso?: "supported" | "unsupported" | "unknown";
  isoValues?: readonly number[];
  shutterGrid?: "continuous" | readonly number[];
  apertureGrid?: "continuous" | readonly number[];
} = {}): ResolvedGenericEquipmentExposureCapabilities => {
  const isoValues = options.isoValues ?? [100,200,400,800,1600,3200,6400,12800];
  const body = parseGenericBodyExposureCapabilityProfile({
    schemaVersion:"0.1.0",
    profileId:"body",
    profileVersion:"1.0.0",
    scientificStatus:"approximation",
    evidence:evidence("body"),
    shutter:{
      durationSecondsRange:{value:{minimum:1/8000,maximum:30},evidence:evidence("shutter")},
      settingGrid: options.shutterGrid && options.shutterGrid !== "continuous"
        ? {kind:"discrete-values",values:{value:options.shutterGrid,evidence:evidence("shutter-grid")}}
        : {kind:"continuous-within-range"}
    },
    iso:{
      range:{value:{minimum:100,maximum:12800},evidence:evidence("iso")},
      settingGrid:{kind:"discrete-values",values:{value:isoValues,evidence:evidence("iso-grid")}},
      autoIso:{value:options.autoIso ?? "supported",evidence:evidence("auto")}
    }
  });
  const lens = parseGenericLensExposureCapabilityProfile({
    schemaVersion:"0.1.0",
    profileId:"lens",
    profileVersion:"1.0.0",
    scientificStatus:"approximation",
    evidence:evidence("lens"),
    focalLengthMmRange:{value:{minimum:50,maximum:50},evidence:evidence("focal")},
    aperture:{
      widestAvailableFNumber:{kind:"constant",fNumber:{value:1.8,evidence:evidence("wide")}},
      narrowestAvailableFNumber:{value:16,evidence:evidence("narrow")},
      settingGrid: options.apertureGrid && options.apertureGrid !== "continuous"
        ? {kind:"discrete-values",values:{value:options.apertureGrid,evidence:evidence("ap-grid")}}
        : {kind:"continuous-within-range"}
    }
  });
  return resolveGenericEquipmentExposureCapabilities({
    bodyProfile:body,lensProfile:lens,selectedFocalLengthMm:50
  });
};

const targetForScale = (scale:number,id="target"): ExposureMeterTarget => {
  const profile = parseExposureMeteringProfile({
    schemaVersion:"0.1.0",profileId:"meter",scientificStatus:"approximation",
    inputDomain:"relative-pre-exposure-linear-signal",captureRegion:"oriented-active-capture",
    policy:{kind:"multi-zone-uniform"},
    target:{kind:"relative-signal-reference",targetRelativeSignal:1,evidence:evidence("target")},
    evidence:evidence("meter"),limitations:["test"]
  });
  const meter = meterRelativeExposure({
    profile,
    sampleSet:{
      measurementId:"m",sceneStateId:"s",
      inputDomain:"relative-pre-exposure-linear-signal",captureRegion:"oriented-active-capture",
      captureGeometry:resolveCaptureGeometry({
        imagingArea:{widthMm:36,heightMm:24},
        nativeRaster:{pixelWidth:6000,pixelHeight:4000},
        orientation:"landscape"
      }).value,
      processingState:{
        exposureSettingsApplied:false,whiteBalanceApplied:false,toneMappingApplied:false,
        displayGammaApplied:false,sharpeningApplied:false
      },
      samples:[{sampleId:"z",positionOrientedCaptureUv:{u:0.5,v:0.5},relativeLinearSignal:1/scale,areaWeight:1}]
    }
  }).value;
  return createExposureMeterTargetFromMeteringResult({targetId:id,meterResult:meter});
};

const darkTarget = (): ExposureMeterTarget => {
  const profile = parseExposureMeteringProfile({
    schemaVersion:"0.1.0",profileId:"meter",scientificStatus:"approximation",
    inputDomain:"relative-pre-exposure-linear-signal",captureRegion:"oriented-active-capture",
    policy:{kind:"multi-zone-uniform"},
    target:{kind:"relative-signal-reference",targetRelativeSignal:1,evidence:evidence("target")},
    evidence:evidence("meter"),limitations:["test"]
  });
  const meter = meterRelativeExposure({
    profile,
    sampleSet:{
      measurementId:"d",sceneStateId:"d",
      inputDomain:"relative-pre-exposure-linear-signal",captureRegion:"oriented-active-capture",
      captureGeometry:resolveCaptureGeometry({
        imagingArea:{widthMm:36,heightMm:24},
        nativeRaster:{pixelWidth:6000,pixelHeight:4000},orientation:"landscape"
      }).value,
      processingState:{
        exposureSettingsApplied:false,whiteBalanceApplied:false,toneMappingApplied:false,
        displayGammaApplied:false,sharpeningApplied:false
      },
      samples:[{sampleId:"z",positionOrientedCaptureUv:{u:0.5,v:0.5},relativeLinearSignal:0,areaWeight:1}]
    }
  }).value;
  return createExposureMeterTargetFromMeteringResult({targetId:"dark",meterResult:meter});
};

const ref={aperture:4,shutterSeconds:1/125,iso:100};

describe("Aperture Priority + Auto ISO",()=>{
  const policy = {
    kind:"minimum-iso-until-slowest-preferred-shutter" as const,
    slowestPreferredShutterSeconds:1/60,
    shutterSelectionPolicy:"not-longer-than-target" as const,
    isoBaseline:"minimum-selectable" as const,
    isoQuantizationPolicy:"nearest-log2-lower-on-tie" as const,
    afterMaximumIso:"allow-slower-shutter" as const
  };

  it("keeps minimum ISO while shutter can meet target above the preferred floor",()=>{
    const r=resolveAperturePriorityAutoIsoExposureMode({
      target:targetForScale(1),capabilities:capabilities(),referenceExposure:ref,
      manualAperture:4,policy
    });
    expect(r.status).toBe("resolved");
    if(r.status!=="resolved") throw new Error("resolved expected");
    expect(r.resolvedSettings).toEqual({aperture:4,shutterSeconds:1/125,iso:100});
    expect(r.afterMaximumIsoFallbackUsed).toBe(false);
  });

  it("holds the preferred shutter region then raises ISO",()=>{
    const r=resolveAperturePriorityAutoIsoExposureMode({
      target:targetForScale(4),capabilities:capabilities(),referenceExposure:ref,
      manualAperture:4,policy
    });
    expect(r.status).toBe("resolved");
    if(r.status!=="resolved") throw new Error("resolved expected");
    expect(r.resolvedSettings.shutterSeconds).toBeCloseTo(1/60,12);
    expect(r.resolvedSettings.iso).toBe(200);
    expect(r.policy.kind).toBe("minimum-iso-until-slowest-preferred-shutter");
  });

  it("allows slower shutter after ISO maximum when policy says so",()=>{
    const r=resolveAperturePriorityAutoIsoExposureMode({
      target:targetForScale(100),capabilities:capabilities({isoValues:[100,200,400,800]}),
      referenceExposure:ref,manualAperture:4,policy
    });
    expect(r.status).toBe("resolved");
    if(r.status!=="resolved") throw new Error("resolved expected");
    expect(r.resolvedSettings.iso).toBe(800);
    expect(r.resolvedSettings.shutterSeconds).toBeGreaterThan(1/60);
    expect(r.afterMaximumIsoFallbackUsed).toBe(true);
  });

  it("can explicitly hold the preferred shutter and report underexposure at ISO max",()=>{
    const r=resolveAperturePriorityAutoIsoExposureMode({
      target:targetForScale(100),capabilities:capabilities({isoValues:[100,200,400,800]}),
      referenceExposure:ref,manualAperture:4,
      policy:{...policy,afterMaximumIso:"hold-preferred-shutter"}
    });
    expect(r.status).toBe("resolved");
    if(r.status!=="resolved") throw new Error("resolved expected");
    expect(r.resolvedSettings.iso).toBe(800);
    expect(r.resolvedSettings.shutterSeconds).toBeCloseTo(1/60,12);
    expect(r.targetResidual.state).toBe("under-target");
  });

  it("blocks unknown Auto ISO and no-signal targets",()=>{
    const unknown=resolveAperturePriorityAutoIsoExposureMode({
      target:targetForScale(1),capabilities:capabilities({autoIso:"unknown"}),
      referenceExposure:ref,manualAperture:4,policy
    });
    expect(unknown).toMatchObject({status:"blocked",blocker:"auto-iso-unknown"});
    const dark=resolveAperturePriorityAutoIsoExposureMode({
      target:darkTarget(),capabilities:capabilities(),referenceExposure:ref,
      manualAperture:4,policy
    });
    expect(dark).toMatchObject({status:"blocked",blocker:"target-no-signal"});
  });
});

describe("Shutter Priority",()=>{
  it("resolves aperture only with manual ISO",()=>{
    const r=resolveShutterPriorityExposureMode({
      target:targetForScale(2),capabilities:capabilities(),referenceExposure:ref,
      manualShutterSeconds:1/125,
      isoControl:{kind:"manual",iso:100,apertureQuantizationPolicy:"nearest-log2-narrower-on-tie"}
    });
    expect(r.status).toBe("resolved");
    if(r.status!=="resolved"||r.isoControl!=="manual") throw new Error("manual expected");
    expect(r.resolvedSettings.shutterSeconds).toBe(1/125);
    expect(r.resolvedSettings.iso).toBe(100);
    expect(r.resolvedSettings.aperture).toBeCloseTo(4/Math.sqrt(2),12);
    expect(r.targetResidual.state).toBe("matched");
  });

  it("quantizes manual-ISO aperture and reports grid residual",()=>{
    const r=resolveShutterPriorityExposureMode({
      target:targetForScale(2),capabilities:capabilities({apertureGrid:[1.8,2.8,4,5.6,8,11,16]}),
      referenceExposure:ref,manualShutterSeconds:1/125,
      isoControl:{kind:"manual",iso:100,apertureQuantizationPolicy:"nearest-log2-narrower-on-tie"}
    });
    expect(r.status).toBe("resolved");
    if(r.status!=="resolved"||r.isoControl!=="manual") throw new Error("manual expected");
    expect(r.apertureResolution.kind).toBe("discrete");
    expect(r.targetResidual.limitingConstraint).toBe("aperture-grid-quantization");
  });

  it("uses aperture first at minimum ISO then Auto ISO fills the remainder",()=>{
    const r=resolveShutterPriorityExposureMode({
      target:targetForScale(16),capabilities:capabilities(),referenceExposure:ref,
      manualShutterSeconds:1/125,
      isoControl:{
        kind:"automatic",
        policy:{
          kind:"minimum-iso-aperture-first",
          isoBaseline:"minimum-selectable",
          isoQuantizationPolicy:"nearest-log2-lower-on-tie",
          apertureSelectionPolicy:"not-wider-than-target"
        }
      }
    });
    expect(r.status).toBe("resolved");
    if(r.status!=="resolved"||r.isoControl!=="automatic") throw new Error("auto expected");
    expect(r.resolvedSettings.aperture).toBe(1.8);
    expect(r.resolvedSettings.iso).toBeGreaterThan(100);
    expect(r.resolvedSettings.shutterSeconds).toBe(1/125);
  });

  it("uses a narrower discrete aperture so Auto ISO can fill rather than overexpose",()=>{
    const r=resolveShutterPriorityExposureMode({
      target:targetForScale(2),capabilities:capabilities({apertureGrid:[1.8,2.8,4,5.6,8,11,16]}),
      referenceExposure:ref,manualShutterSeconds:1/125,
      isoControl:{
        kind:"automatic",
        policy:{
          kind:"minimum-iso-aperture-first",
          isoBaseline:"minimum-selectable",
          isoQuantizationPolicy:"nearest-log2-lower-on-tie",
          apertureSelectionPolicy:"not-wider-than-target"
        }
      }
    });
    expect(r.status).toBe("resolved");
    if(r.status!=="resolved"||r.isoControl!=="automatic") throw new Error("auto expected");
    expect(r.resolvedSettings.aperture).toBe(4);
    expect(r.resolvedSettings.iso).toBe(200);
  });

  it("blocks unsupported Auto ISO and no-signal automatic aperture",()=>{
    const unsupported=resolveShutterPriorityExposureMode({
      target:targetForScale(2),capabilities:capabilities({autoIso:"unsupported"}),referenceExposure:ref,
      manualShutterSeconds:1/125,
      isoControl:{kind:"automatic",policy:{
        kind:"minimum-iso-aperture-first",isoBaseline:"minimum-selectable",
        isoQuantizationPolicy:"nearest-log2-lower-on-tie",apertureSelectionPolicy:"not-wider-than-target"
      }}
    });
    expect(unsupported).toMatchObject({status:"blocked",blocker:"auto-iso-unsupported"});
    const dark=resolveShutterPriorityExposureMode({
      target:darkTarget(),capabilities:capabilities(),referenceExposure:ref,
      manualShutterSeconds:1/125,
      isoControl:{kind:"manual",iso:100,apertureQuantizationPolicy:"nearest-log2-narrower-on-tie"}
    });
    expect(dark).toMatchObject({status:"blocked",blocker:"target-no-signal"});
  });

  it("fails closed on invalid policy and unsupported manual shutter",()=>{
    expect(()=>resolveShutterPriorityExposureMode({
      target:targetForScale(1),capabilities:capabilities(),referenceExposure:ref,
      manualShutterSeconds:60,
      isoControl:{kind:"manual",iso:100,apertureQuantizationPolicy:"nearest-log2-narrower-on-tie"}
    })).toThrow("manualShutterSeconds lies outside");

    expect(()=>resolveShutterPriorityExposureMode({
      target:targetForScale(1),capabilities:capabilities(),referenceExposure:ref,
      manualShutterSeconds:1/125,
      isoControl:{kind:"automatic",policy:{
        kind:"magic",
        isoBaseline:"minimum-selectable",
        isoQuantizationPolicy:"nearest-log2-lower-on-tie",
        apertureSelectionPolicy:"not-wider-than-target"
      }} as never
    })).toThrow("policy is invalid");
  });
});

describe("priority-mode guard and limit coverage",()=>{
  const aPolicy = {
    kind:"minimum-iso-until-slowest-preferred-shutter" as const,
    slowestPreferredShutterSeconds:1/50,
    shutterSelectionPolicy:"not-longer-than-target" as const,
    isoBaseline:"minimum-selectable" as const,
    isoQuantizationPolicy:"nearest-log2-lower-on-tie" as const,
    afterMaximumIso:"allow-slower-shutter" as const
  };

  it("uses a discrete shutter no longer than the Aperture Priority preference",()=>{
    const r=resolveAperturePriorityAutoIsoExposureMode({
      target:targetForScale(4),
      capabilities:capabilities({shutterGrid:[1/125,1/60,1/30,1/15]}),
      referenceExposure:ref,manualAperture:4,policy:aPolicy
    });
    expect(r.status).toBe("resolved");
    if(r.status!=="resolved") throw new Error("resolved expected");
    expect(r.resolvedSettings.shutterSeconds).toBeCloseTo(1/60,12);
    expect(r.shutterResolution.kind).toBe("discrete");
    expect(r.resolvedSettings.iso).toBe(200);
  });

  it("fails closed on invalid Aperture Priority policy and preferred-shutter range",()=>{
    expect(()=>resolveAperturePriorityAutoIsoExposureMode({
      target:targetForScale(1),capabilities:capabilities(),referenceExposure:ref,
      manualAperture:4,policy:{...aPolicy,kind:"magic"} as never
    })).toThrow("policy is invalid");
    expect(()=>resolveAperturePriorityAutoIsoExposureMode({
      target:targetForScale(1),capabilities:capabilities(),referenceExposure:ref,
      manualAperture:4,policy:{...aPolicy,slowestPreferredShutterSeconds:60}
    })).toThrow("lies outside the resolved shutter capability range");
  });

  it("blocks unsupported Aperture Priority Auto ISO",()=>{
    const r=resolveAperturePriorityAutoIsoExposureMode({
      target:targetForScale(1),capabilities:capabilities({autoIso:"unsupported"}),
      referenceExposure:ref,manualAperture:4,policy:aPolicy
    });
    expect(r).toMatchObject({status:"blocked",blocker:"auto-iso-unsupported"});
  });

  it("clamps Shutter Priority manual ISO at widest and narrowest apertures with residuals",()=>{
    const dark=resolveShutterPriorityExposureMode({
      target:targetForScale(100),capabilities:capabilities(),referenceExposure:ref,
      manualShutterSeconds:1/125,
      isoControl:{kind:"manual",iso:100,apertureQuantizationPolicy:"nearest-log2-narrower-on-tie"}
    });
    const bright=resolveShutterPriorityExposureMode({
      target:targetForScale(0.01),capabilities:capabilities(),referenceExposure:ref,
      manualShutterSeconds:1/125,
      isoControl:{kind:"manual",iso:100,apertureQuantizationPolicy:"nearest-log2-narrower-on-tie"}
    });
    if(dark.status!=="resolved"||dark.isoControl!=="manual"||bright.status!=="resolved"||bright.isoControl!=="manual"){
      throw new Error("resolved manual modes expected");
    }
    expect(dark.apertureResolution.clamped).toBe("widest");
    expect(dark.targetResidual.state).toBe("under-target");
    expect(bright.apertureResolution.clamped).toBe("narrowest");
    expect(bright.targetResidual.state).toBe("over-target");
  });

  it("blocks no-signal Shutter Priority Auto ISO and rejects invalid ISO-control kind",()=>{
    const dark=resolveShutterPriorityExposureMode({
      target:darkTarget(),capabilities:capabilities(),referenceExposure:ref,
      manualShutterSeconds:1/125,
      isoControl:{kind:"automatic",policy:{
        kind:"minimum-iso-aperture-first",isoBaseline:"minimum-selectable",
        isoQuantizationPolicy:"nearest-log2-lower-on-tie",apertureSelectionPolicy:"not-wider-than-target"
      }}
    });
    expect(dark).toMatchObject({status:"blocked",blocker:"target-no-signal"});
    expect(()=>resolveShutterPriorityExposureMode({
      target:targetForScale(1),capabilities:capabilities(),referenceExposure:ref,
      manualShutterSeconds:1/125,isoControl:{kind:"magic"} as never
    })).toThrow("isoControl.kind is invalid");
  });

  it("reports under-target when Shutter Priority Auto ISO exhausts widest aperture and ISO maximum",()=>{
    const r=resolveShutterPriorityExposureMode({
      target:targetForScale(100),capabilities:capabilities({isoValues:[100,200,400,800]}),
      referenceExposure:ref,manualShutterSeconds:1/125,
      isoControl:{kind:"automatic",policy:{
        kind:"minimum-iso-aperture-first",isoBaseline:"minimum-selectable",
        isoQuantizationPolicy:"nearest-log2-lower-on-tie",apertureSelectionPolicy:"not-wider-than-target"
      }}
    });
    expect(r.status).toBe("resolved");
    if(r.status!=="resolved"||r.isoControl!=="automatic") throw new Error("auto expected");
    expect(r.resolvedSettings.aperture).toBe(1.8);
    expect(r.resolvedSettings.iso).toBe(800);
    expect(r.targetResidual.state).toBe("under-target");
    expect(r.isoResolution.clamped).toBe("maximum");
  });
});

