import { describe, expect, it } from "vitest";

import {
  mapImagePlanePointToOrientedPhysicalUv,
  mapOrientedPhysicalUvToImagePlanePoint,
  resolveCaptureGeometry,
  type CaptureOrientation,
  type PhysicalBoundsFromOpticalAxisMm
} from "../src/index.js";

const ORIENTATIONS: readonly CaptureOrientation[] = [
  "landscape",
  "portrait-clockwise",
  "landscape-inverted",
  "portrait-counter-clockwise"
];

describe("oriented physical raster ↔ image-plane metric bridge", () => {
  it("converts the landscape raster +Y-down basis into image-plane +Y-up", () => {
    const bounds = { left: -18, right: 18, top: -12, bottom: 12 };

    expect(
      mapOrientedPhysicalUvToImagePlanePoint({
        uv: { u: 0, v: 0 },
        orientedPhysicalBoundsFromOpticalAxisMm: bounds,
        orientation: "landscape"
      })
    ).toEqual({ x: -18, y: 12 });

    expect(
      mapOrientedPhysicalUvToImagePlanePoint({
        uv: { u: 1, v: 1 },
        orientedPhysicalBoundsFromOpticalAxisMm: bounds,
        orientation: "landscape"
      })
    ).toEqual({ x: 18, y: -12 });

    const center = mapOrientedPhysicalUvToImagePlanePoint({
      uv: { u: 0.5, v: 0.5 },
      orientedPhysicalBoundsFromOpticalAxisMm: bounds,
      orientation: "landscape"
    });
    expect(center.x).toBeCloseTo(0, 12);
    expect(center.y).toBeCloseTo(0, 12);
  });

  it("round-trips deterministic points for all four physical orientations", () => {
    const boundsByOrientation: Record<
      CaptureOrientation,
      PhysicalBoundsFromOpticalAxisMm
    > = {
      landscape: { left: -18, right: 18, top: -12, bottom: 12 },
      "portrait-clockwise": { left: -12, right: 12, top: -18, bottom: 18 },
      "landscape-inverted": { left: -18, right: 18, top: -12, bottom: 12 },
      "portrait-counter-clockwise": {
        left: -12,
        right: 12,
        top: -18,
        bottom: 18
      }
    };

    for (const orientation of ORIENTATIONS) {
      const bounds = boundsByOrientation[orientation];
      for (const uv of [
        { u: 0, v: 0 },
        { u: 0.25, v: 0.75 },
        { u: 0.5, v: 0.5 },
        { u: 1, v: 1 }
      ]) {
        const imagePlanePointMm =
          mapOrientedPhysicalUvToImagePlanePoint({
            uv,
            orientedPhysicalBoundsFromOpticalAxisMm: bounds,
            orientation
          });

        const roundTrip = mapImagePlanePointToOrientedPhysicalUv({
          imagePlanePointMm,
          orientedPhysicalBoundsFromOpticalAxisMm: bounds,
          orientation
        });

        expect(roundTrip.u).toBeCloseTo(uv.u, 12);
        expect(roundTrip.v).toBeCloseTo(uv.v, 12);
      }
    }
  });

  it("preserves off-axis/asymmetric physical regions rather than recentering them", () => {
    const bounds = { left: -18, right: 0, top: -12, bottom: 0 };

    const point = mapOrientedPhysicalUvToImagePlanePoint({
      uv: { u: 0.5, v: 0.5 },
      orientedPhysicalBoundsFromOpticalAxisMm: bounds,
      orientation: "landscape"
    });

    expect(point).toEqual({ x: -9, y: 6 });
    expect(
      mapImagePlanePointToOrientedPhysicalUv({
        imagePlanePointMm: point,
        orientedPhysicalBoundsFromOpticalAxisMm: bounds,
        orientation: "landscape"
      })
    ).toEqual({ u: 0.5, v: 0.5 });
  });

  it("maps portrait orientation through native physical coordinates instead of swapping axes ad hoc", () => {
    const bounds = { left: -12, right: 12, top: -18, bottom: 18 };

    expect(
      mapOrientedPhysicalUvToImagePlanePoint({
        uv: { u: 0, v: 0 },
        orientedPhysicalBoundsFromOpticalAxisMm: bounds,
        orientation: "portrait-clockwise"
      })
    ).toEqual({ x: -18, y: -12 });

    expect(
      mapOrientedPhysicalUvToImagePlanePoint({
        uv: { u: 1, v: 1 },
        orientedPhysicalBoundsFromOpticalAxisMm: bounds,
        orientation: "portrait-clockwise"
      })
    ).toEqual({ x: 18, y: 12 });
  });

  it("fails closed on invalid UVs, bounds, orientations, and out-of-region reverse mappings", () => {
    const bounds = { left: -18, right: 18, top: -12, bottom: 12 };

    expect(() =>
      mapOrientedPhysicalUvToImagePlanePoint({
        uv: { u: -0.01, v: 0.5 },
        orientedPhysicalBoundsFromOpticalAxisMm: bounds,
        orientation: "landscape"
      })
    ).toThrow("within [0, 1]");

    expect(() =>
      mapOrientedPhysicalUvToImagePlanePoint({
        uv: { u: 0.5, v: 0.5 },
        orientedPhysicalBoundsFromOpticalAxisMm: {
          left: 1,
          right: 1,
          top: -1,
          bottom: 1
        },
        orientation: "landscape"
      })
    ).toThrow("right greater than left");

    expect(() =>
      mapOrientedPhysicalUvToImagePlanePoint({
        uv: { u: 0.5, v: 0.5 },
        orientedPhysicalBoundsFromOpticalAxisMm: bounds,
        orientation: "sideways" as CaptureOrientation
      })
    ).toThrow("orientation is invalid");

    expect(() =>
      mapImagePlanePointToOrientedPhysicalUv({
        imagePlanePointMm: { x: 19, y: 0 },
        orientedPhysicalBoundsFromOpticalAxisMm: bounds,
        orientation: "landscape"
      })
    ).toThrow("within the supplied oriented physical bounds");
  });

  it("clamps only tiny floating-point edge noise during reverse mapping", () => {
    const bounds = { left: -18, right: 18, top: -12, bottom: 12 };

    const uv = mapImagePlanePointToOrientedPhysicalUv({
      imagePlanePointMm: { x: 18 + 1e-13, y: -12 },
      orientedPhysicalBoundsFromOpticalAxisMm: bounds,
      orientation: "landscape"
    });

    expect(uv).toEqual({ u: 1, v: 1 });
  });
  it("round-trips asymmetric resolved output geometry for all four orientations", () => {
    const nativeRaster = { pixelWidth: 6000, pixelHeight: 4000 };
    const imagingArea = { widthMm: 36, heightMm: 24 };

    for (const orientation of ORIENTATIONS) {
      const activeOnly = resolveCaptureGeometry({
        imagingArea,
        nativeRaster,
        orientation,
        activeCaptureRect: {
          x: 420,
          y: 360,
          width: 4560,
          height: 2920
        }
      }).value;
      const orientedRaster = activeOnly.orientedCapture.raster;
      const outputCropRect = {
        x: Math.floor(orientedRaster.pixelWidth * 0.08),
        y: Math.floor(orientedRaster.pixelHeight * 0.17),
        width: Math.floor(orientedRaster.pixelWidth * 0.63),
        height: Math.floor(orientedRaster.pixelHeight * 0.57)
      };
      const geometry = resolveCaptureGeometry({
        imagingArea,
        nativeRaster,
        orientation,
        activeCaptureRect: {
          x: 420,
          y: 360,
          width: 4560,
          height: 2920
        },
        outputCropRect
      }).value;
      const bounds = geometry.output.physicalBoundsFromOpticalAxisMm;

      for (const uv of [
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 0.37, v: 0.61 },
        { u: 0.5, v: 0.5 },
        { u: 1, v: 1 }
      ]) {
        const point = mapOrientedPhysicalUvToImagePlanePoint({
          uv,
          orientedPhysicalBoundsFromOpticalAxisMm: bounds,
          orientation
        });
        const roundTrip = mapImagePlanePointToOrientedPhysicalUv({
          imagePlanePointMm: point,
          orientedPhysicalBoundsFromOpticalAxisMm: bounds,
          orientation
        });

        expect(roundTrip.u).toBeCloseTo(uv.u, 12);
        expect(roundTrip.v).toBeCloseTo(uv.v, 12);
      }

      const center = mapOrientedPhysicalUvToImagePlanePoint({
        uv: { u: 0.5, v: 0.5 },
        orientedPhysicalBoundsFromOpticalAxisMm: bounds,
        orientation
      });
      expect(Math.hypot(center.x, center.y)).toBeGreaterThan(0.25);
    }
  });

  it("scales reverse-edge tolerance with physical bounds rather than normalized UV", () => {
    const tinyBounds = {
      left: -1e-9,
      right: 1e-9,
      top: -1e-9,
      bottom: 1e-9
    };

    expect(() =>
      mapImagePlanePointToOrientedPhysicalUv({
        imagePlanePointMm: { x: 1e-9 + 1e-15, y: 0 },
        orientedPhysicalBoundsFromOpticalAxisMm: tinyBounds,
        orientation: "landscape"
      })
    ).toThrow("within the supplied oriented physical bounds");
  });

});
