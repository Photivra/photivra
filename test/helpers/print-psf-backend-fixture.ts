// SPDX-License-Identifier: Apache-2.0
import { calculateSensorSpatialSamplingQuadrature, calculateSensorSpectralQuadrature, calculateSensorPsfIrradianceQuadrature,
  type LensPsfKernel } from "../../src/index.js";
import { psfInput } from "./psf-quadrature-fixture.js";
import { input as sensorInput } from "./eqe-exposure-fixture.js";

export interface PrintPsfExperiment {
  frequencyCyclesPerMm: { x: number; y: number };
  phaseRadians: number;
  spatialSampleCount: number;
  kernel: "identity" | "horizontal" | "isotropic" | "asymmetric";
}
export const PRINT_PSF_KERNELS: Record<PrintPsfExperiment["kernel"], readonly number[]> = {
  identity: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  horizontal: [0, 0, 0, .25, .5, .25, 0, 0, 0],
  isotropic: [0, .125, 0, .125, .5, .125, 0, .125, 0],
  asymmetric: [0, 0, 0, 0, .25, .25, 0, .5, 0]
};

/** Execute the public local PSF and geometric-aperture integration backend.
 * Neutral wavelength-constant irradiance divided by the explicit 100-nm band
 * width is a relative scalar signal. No spectral detector/QE or color conversion
 * is inferred, and these owned kernels are not named-lens calibration.
 */
export function renderPrintPsfExperiment(experiment: PrintPsfExperiment): number[] {
  const sensor = sensorInput(), nativeRaster = { pixelWidth: 8, pixelHeight: 8 }, imagingArea = { widthMm: 8, heightMm: 8 };
  const color = { ...sensor.colorSamplingProfile, profileId: "owned-neutral-sites", layout: { kind: "periodic-mosaic" as const,
    repeatWidthSites: 1, repeatHeightSites: 1, siteChannelIds: ["green"], anchor: "native-sensor-top-left-site" as const } };
  const binding = { ...sensor.localExposure.bindingProfile, colorSamplingProfileId: color.profileId, nativeRaster };
  const aperture = { ...sensor.spatialSampling.samplingApertureProfile, colorSamplingProfileId: color.profileId };
  const spectral = calculateSensorSpectralQuadrature({ ...sensor.spectralSampling, colorSamplingProfile: color,
    spectralResponseProfile: { ...sensor.spectralResponseProfile, colorSamplingProfileId: color.profileId } }).value;
  const request = psfInput(), kernel: LensPsfKernel = { ...request.psf.profile.nodes[0]!.kernel,
    samplePitchMicrometersX: 1000, samplePitchMicrometersY: 1000, normalizedIntensity: [...PRINT_PSF_KERNELS[experiment.kernel]] };
  request.psf.profile.nodes = request.psf.profile.nodes.map(n => ({ ...n, kernel }));
  request.spectralQuadrature = spectral;
  const output: number[] = [], f = experiment.frequencyCyclesPerMm;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const spatial = calculateSensorSpatialSamplingQuadrature({ imagingArea, nativeRaster, colorSamplingProfile: color,
      colorSamplingBindingProfile: binding, samplingApertureProfile: aperture, opticalStackProfile: sensor.spatialSampling.opticalStackProfile,
      site: { x, y }, spatialSampleCountX: experiment.spatialSampleCount, spatialSampleCountY: experiment.spatialSampleCount }).value;
    request.spatialQuadrature = spatial;
    request.samples = spectral.nodes.flatMap(s => spatial.nodes.map(p => ({ node: {
      spatialNode: { antiAliasingComponentIndex: p.antiAliasingComponentIndex, apertureSampleXIndex: p.apertureSampleXIndex,
        apertureSampleYIndex: p.apertureSampleYIndex }, spectralSampleIndex: s.spectralSampleIndex, wavelengthNanometers: s.wavelengthNanometers },
      sourceSamples: Array.from({ length: 9 }, (_, i) => {
        // Independent test adapter writes every tap's physical position. The runtime
        // checks inverse support itself; no engine helper generates these positions.
        const sx = p.preAntiAliasingSourcePointMm.x - (i % 3 - 1), sy = p.preAntiAliasingSourcePointMm.y + (Math.floor(i / 3) - 1);
        return { timeSecondsFromOpeningReference: 0, kernelSampleX: i % 3, kernelSampleY: Math.floor(i / 3),
          sourcePointNativeSensorMm: { x: sx, y: sy }, spectralIrradianceWattsPerSquareMeterPerNanometer:
            1 + .5 * Math.cos(2 * Math.PI * (f.x * sx + f.y * sy) + experiment.phaseRadians) };
      }) } )));
    const reduced = calculateSensorPsfIrradianceQuadrature(request).value.reduction.value;
    output.push(reduced.wavelengthIntegratedSpatialAverageIrradianceWattsPerSquareMeter / 100);
  }
  return output;
}
