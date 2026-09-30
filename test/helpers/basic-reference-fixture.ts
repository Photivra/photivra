import { readFileSync } from "node:fs";

export interface BasicReferenceFixture {
  schemaVersion: "0.1.0";
  fixtureId: "basic-reference-scene";
  description: string;
  provenance: {
    sourceOrigin: "photivra";
    sourceReference: string;
    reuseStatus: "photivra-owned";
  };
  sensor: {
    imagingArea: {
      widthMm: number;
      heightMm: number;
    };
    nativeRaster: {
      pixelWidth: number;
      pixelHeight: number;
    };
    orientation: "landscape";
  };
  lens: {
    model: "ideal-thin-lens";
    focalLengthMm: number;
    aperture: number;
    distortion: "none";
    lateralChromaticAberration: "none";
    vignetting: "none";
  };
  exposure: {
    shutterSeconds: number;
    iso: number;
  };
  focus: {
    distanceM: number;
    circleOfConfusionMm: number;
  };
  target: {
    kind: "planar-lambertian";
    widthM: number;
    heightM: number;
    distanceM: number;
    centerM: {
      x: number;
      y: number;
      z: number;
    };
    velocityMps: {
      x: number;
      y: number;
      z: number;
    };
    reflectance: number;
  };
  illumination: {
    kind: "uniform-monochromatic-spectral-irradiance";
    wavelengthNm: number;
    spectralIrradianceWattsPerSquareMeterNanometer: number;
  };
  support: {
    kind: "ideal-stable";
    angularVelocityRadPerSec: {
      yaw: number;
      pitch: number;
      roll: number;
    };
  };
  stabilization: {
    enabled: false;
  };
  corrections: {
    distortion: false;
    chromaticAberration: false;
    vignetting: false;
    digitalLensCorrection: false;
  };
  stochasticSeedUint32: number;
  expected: {
    sensor: {
      diagonalMm: number;
      aspectRatio: number;
      cropFactor35Mm: number;
      pitchXMicrometers: number;
      pitchYMicrometers: number;
      totalImageSamples: number;
      megapixels: number;
    };
    projection: {
      imageDistanceMm: number;
      magnification: number;
      infinityProjectionScale: number;
      horizontalFieldOfViewDegrees: number;
      verticalFieldOfViewDegrees: number;
      diagonalFieldOfViewDegrees: number;
      projectedTargetWidthMm: number;
      projectedTargetHeightMm: number;
      projectedTargetWidthPixels: number;
      projectedTargetHeightPixels: number;
    };
    focus: {
      defocusDiameterMm: number;
      hyperfocalDistanceM: number;
      nearLimitM: number;
      farLimitM: number;
      totalDepthOfFieldM: number;
    };
    diffraction: {
      wavelengthNm: number;
      firstZeroDiameterMicrometers: number;
    };
    exposure: {
      ev100: number;
    };
    radiance: {
      lambertianSpectralRadianceWattsPerSquareMeterSteradianNanometer: number;
    };
  };
}

const fixtureUrl = new URL(
  "../fixtures/basic-reference-scene.json",
  import.meta.url
);

export function loadBasicReferenceFixture(): BasicReferenceFixture {
  return JSON.parse(
    readFileSync(fixtureUrl, "utf8")
  ) as BasicReferenceFixture;
}
