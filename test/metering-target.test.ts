import { describe, expect, it } from "vitest";

import {
  createExposureMeterTargetFromMeteringResult,
  meterRelativeExposure,
  parseExposureMeteringProfile,
  resolveCaptureGeometry,
  setExposureCompensationOnMeterTarget,
  type ExposureMeteringResult
} from "../src/index.js";

const evidence = (ref: string) => [{
  sourceOrigin: "photivra" as const,
  sourceReference: ref,
  reuseStatus: "photivra-owned" as const
}] as const;

const meter = (signal: number): ExposureMeteringResult =>
  meterRelativeExposure({
    profile: parseExposureMeteringProfile({
      schemaVersion: "0.1.0",
      profileId: "meter",
      scientificStatus: "approximation",
      inputDomain: "relative-pre-exposure-linear-signal",
      captureRegion: "oriented-active-capture",
      policy: { kind: "multi-zone-uniform" },
      target: {
        kind: "relative-signal-reference",
        targetRelativeSignal: 1,
        evidence: evidence("target")
      },
      evidence: evidence("meter"),
      limitations: ["test"]
    }),
    sampleSet: {
      measurementId: "m-1",
      sceneStateId: "scene-1",
      inputDomain: "relative-pre-exposure-linear-signal",
      captureRegion: "oriented-active-capture",
      captureGeometry: resolveCaptureGeometry({
        imagingArea: { widthMm: 36, heightMm: 24 },
        nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
        orientation: "landscape"
      }).value,
      processingState: {
        exposureSettingsApplied: false,
        whiteBalanceApplied: false,
        toneMappingApplied: false,
        displayGammaApplied: false,
        sharpeningApplied: false
      },
      samples: [{
        sampleId: "s",
        positionOrientedCaptureUv: { u: 0.5, v: 0.5 },
        relativeLinearSignal: signal,
        areaWeight: 1
      }]
    }
  }).value;

describe("exposure meter target seam", () => {
  it("freezes a resolved meter result into a #99-ready target", () => {
    const target = createExposureMeterTargetFromMeteringResult({
      targetId: "target-1",
      meterResult: meter(0.5)
    });
    expect(target.status).toBe("resolved");
    expect(target.sourceMeterSnapshot).toEqual({
      sourceKind: "spatial-metering-result",
      measurementId: "m-1",
      sceneStateId: "scene-1",
      meteringProfileId: "meter"
    });
    if (target.status !== "resolved") throw new Error("resolved expected");
    expect(target.baseExposureOffsetStopsToTarget).toBeCloseTo(1, 12);
    expect(target.exposureOffsetStopsToTarget).toBeCloseTo(1, 12);
    expect(target.requiredExposureScaleToTarget).toBeCloseTo(2, 12);
    expect(target.exposureCompensationStops).toBe(0);
    expect(target.exposureCompensationApplied).toBe(false);
    expect(target.intendedConsumer).toBe("exposure-mode-resolver");
  });

  it("applies positive and negative compensation without mutating base meter values", () => {
    const base = createExposureMeterTargetFromMeteringResult({
      targetId: "base",
      meterResult: meter(0.5)
    });
    const plus = setExposureCompensationOnMeterTarget({
      targetId: "plus",
      baseTarget: base,
      exposureCompensationStops: 1
    });
    const minus = setExposureCompensationOnMeterTarget({
      targetId: "minus",
      baseTarget: plus,
      exposureCompensationStops: -1
    });

    expect(base.exposureCompensationStops).toBe(0);
    expect(plus.status).toBe("resolved");
    expect(minus.status).toBe("resolved");
    if (plus.status !== "resolved" || minus.status !== "resolved") {
      throw new Error("resolved expected");
    }
    expect(plus.baseExposureOffsetStopsToTarget).toBeCloseTo(1, 12);
    expect(plus.exposureOffsetStopsToTarget).toBeCloseTo(2, 12);
    expect(plus.requiredExposureScaleToTarget).toBeCloseTo(4, 12);
    expect(minus.baseExposureOffsetStopsToTarget).toBeCloseTo(1, 12);
    expect(minus.exposureOffsetStopsToTarget).toBeCloseTo(0, 12);
    expect(minus.requiredExposureScaleToTarget).toBeCloseTo(1, 12);
    expect(plus.sourceMeterSnapshot).toEqual(base.sourceMeterSnapshot);
    expect(minus.sourceMeterSnapshot).toEqual(base.sourceMeterSnapshot);
    expect(plus.meterMeasurementMutated).toBe(false);
  });

  it("preserves no-signal semantics under compensation", () => {
    const base = createExposureMeterTargetFromMeteringResult({
      targetId: "dark-base",
      meterResult: meter(0)
    });
    expect(base.status).toBe("no-signal");
    const adjusted = setExposureCompensationOnMeterTarget({
      targetId: "dark-plus",
      baseTarget: base,
      exposureCompensationStops: 2
    });
    expect(adjusted.status).toBe("no-signal");
    expect(adjusted.exposureCompensationStops).toBe(2);
    expect(adjusted.meteredRelativeSignal).toBe(0);
  });

  it("rejects invalid identity, hidden compensation, and invalid meter-stage state", () => {
    expect(() => createExposureMeterTargetFromMeteringResult({
      targetId: " ",
      meterResult: meter(1)
    })).toThrow("targetId must be a non-empty string");

    expect(() => createExposureMeterTargetFromMeteringResult({
      targetId: "x",
      meterResult: {
        ...meter(1),
        exposureCompensationApplied: true as never
      }
    })).toThrow("uncompensated base metering result");

    expect(() => createExposureMeterTargetFromMeteringResult({
      targetId: "x",
      meterResult: {
        ...meter(1),
        automaticExposureResolved: true as never
      }
    })).toThrow("precede automatic exposure resolution");
  });

  it("rejects contradictory no-signal results and duplicate target identity", () => {
    const base = createExposureMeterTargetFromMeteringResult({
      targetId: "base",
      meterResult: meter(1)
    });
    expect(() => setExposureCompensationOnMeterTarget({
      targetId: "base",
      baseTarget: base,
      exposureCompensationStops: 1
    })).toThrow("must use a new targetId");

    const forged = {
      ...meter(0),
      meteredRelativeSignal: 0.1
    } as ExposureMeteringResult;
    expect(() => createExposureMeterTargetFromMeteringResult({
      targetId: "forged",
      meterResult: forged
    })).toThrow("no-signal meter result must have meteredRelativeSignal equal to zero");
  });

  it("rejects non-finite compensation and overflow", () => {
    const base = createExposureMeterTargetFromMeteringResult({
      targetId: "base",
      meterResult: meter(1)
    });
    expect(() => setExposureCompensationOnMeterTarget({
      targetId: "nan",
      baseTarget: base,
      exposureCompensationStops: Number.NaN
    })).toThrow("exposureCompensationStops must be finite");

    expect(() => setExposureCompensationOnMeterTarget({
      targetId: "overflow",
      baseTarget: base,
      exposureCompensationStops: 2000
    })).toThrow("must remain finite and greater than zero");
  });

  it("fails closed on malformed base-target boundary fields", () => {
    const base = createExposureMeterTargetFromMeteringResult({
      targetId: "base",
      meterResult: meter(1)
    });
    expect(() => setExposureCompensationOnMeterTarget({
      targetId: "bad",
      baseTarget: {
        ...base,
        automaticExposureResolved: true as never
      },
      exposureCompensationStops: 0
    })).toThrow("does not satisfy the exposure-meter target boundary");
  });
});
