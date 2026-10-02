// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { calculateSensorPsfIrradianceQuadrature, calculateSensorEqeTemporalExposure,
  type CalculateSensorPsfIrradianceQuadratureInput, type LensSampledPsfProfile } from "../src/index.js";
import { input as sensorInput } from "./helpers/eqe-exposure-fixture.js";
import { sceneOpticalInput } from "./helpers/scene-optical-quadrature-fixture.js";
import { evidence } from "./helpers/eqe-response-fixture.js";

function request(time = 0, field: (x: number, y: number, nm: number) => number = () => 2): CalculateSensorPsfIrradianceQuadratureInput {
  const scene = sceneOpticalInput();
  const axes = { focalLengthMm: [50], focusDiopters: [0], apertureFNumber: [4], fieldXmm: [-20, 20],
    fieldYmm: [-20, 20], wavelengthNm: [400, 500], signedDefocusImagePlaneMicrometers: [0] };
  const kernel = { widthSamples: 3, heightSamples: 3, samplePitchMicrometersX: 100,
    samplePitchMicrometersY: 200, centerSampleX: 1, centerSampleY: 1,
    normalizedIntensity: [0,0,0,0,0.25,0.25,0,0.5,0] };
  const profile: LensSampledPsfProfile = { schemaVersion: "0.1.0", profileId: "owned-psf", profileVersion: "1",
    scientificStatus: "approximation", opticalDomain: "lens-primary-optical-path-only", coordinateSystem: "image-plane-metric",
    fieldAxes: "+X right, +Y up", kernelEnergyNormalization: "unit-energy-shape", interpolation: "bounded-regular-grid-multilinear",
    throughputOwnership: "separate-relative-pupil-throughput-factor", responseIncludes: {
      diffraction: true, aberration: true, defocus: true, pupilClippingShape: true },
    sensorOpticalStackIncluded: false, sensorSamplingIncluded: false, reconstructionIncluded: false,
    strayLightIncluded: false, axes, evidence: evidence("test:psf"), limitations: ["Owned synthetic local kernel."],
    nodes: axes.fieldXmm.flatMap(x => axes.fieldYmm.flatMap(y => axes.wavelengthNm.map(nm => ({
      nodeId: `psf-${x}-${y}-${nm}`, coordinate: { focalLengthMm: 50, focusDiopters: 0, apertureFNumber: 4,
        fieldXmm: x, fieldYmm: y, wavelengthNm: nm, signedDefocusImagePlaneMicrometers: 0 },
      kernel, bestFocusImagePlaneOffsetMicrometers: 0, relativePupilThroughputFactor: 0.6,
      evidence: evidence("test:psf-node"), uncertainty: { kind: "not-quantified" as const, limitation: "Synthetic." }
    })))) };
  return { timeSecondsFromOpeningReference: time, spatialQuadrature: scene.spatialQuadrature,
    spectralQuadrature: scene.spectralQuadrature, psf: { profile, focalLengthMm: 50,
      focus: { kind: "infinity" }, apertureFNumber: 4, signedDefocusImagePlaneMicrometers: 0 },
    psfWavelengthBasis: { value: "vacuum", evidence: evidence("test:psf-basis") },
    spatialModel: { kind: "destination-local-shift-invariant-approximation", evidence: evidence("test:isoplanatic"),
      limitation: "Only the declared finite synthetic neighborhood is represented." },
    inputMeaning: "pre-psf-pre-sensor-stack-pre-aa-spectral-irradiance",
    samples: scene.samples.map(s => {
      const p = scene.spatialQuadrature.nodes.find(p => p.antiAliasingComponentIndex === s.node.spatialNode.antiAliasingComponentIndex &&
        p.apertureSampleXIndex === s.node.spatialNode.apertureSampleXIndex && p.apertureSampleYIndex === s.node.spatialNode.apertureSampleYIndex)!;
      return { node: s.node, sourceSamples: Array.from({ length: 9 }, (_, i) => {
        const kernelSampleX = i%3, kernelSampleY = Math.floor(i/3);
        const x = p.preAntiAliasingSourcePointMm.x-(kernelSampleX-1)*100/1000;
        const y = p.preAntiAliasingSourcePointMm.y+(kernelSampleY-1)*200/1000;
        return { kernelSampleX, kernelSampleY, sourcePointNativeSensorMm: { x, y }, timeSecondsFromOpeningReference: time,
          spectralIrradianceWattsPerSquareMeterPerNanometer: field(x,y,s.node.wavelengthNanometers) };
      }) };
    }) };
}

it("preserves uniform irradiance and unit energy without multiplying pupil throughput", () => {
  const r = request(), snapshot = structuredClone(r);
  const result = calculateSensorPsfIrradianceQuadrature(r);
  expect(r).toEqual(snapshot);
  result.value.irradianceSamples.forEach(s => expect(s.spectralIrradianceWattsPerSquareMeterPerNanometer).toBeCloseTo(2, 14));
  result.value.samples.forEach(s => expect(s.psf.value.relativePupilThroughputFactor).toBeCloseTo(0.6, 14));
  expect(result.value).toMatchObject({ pupilThroughputApplied: false, psfRedistributionApplied: true,
    globalFieldEnergyConservationEstablished: false, localShiftInvarianceEstablished: false });
  expect(calculateSensorPsfIrradianceQuadrature({ ...r, samples: [...r.samples].reverse().map(s => ({ ...s,
    sourceSamples: [...s.sourceSamples].reverse() })) })).toEqual(result);
  r.samples[0]!.sourceSamples[0]!.sourcePointNativeSensorMm.x = 99;
  expect(result.value.samples[0]!.sourceSamples[0]!.sourcePointNativeSensorMm.x).not.toBe(99);
});

it("keeps asymmetric X/Y kernel orientation through the native-to-image coordinate bridge", () => {
  const result = calculateSensorPsfIrradianceQuadrature(request(0, (x,y,nm) => 10+x+2*y+nm/1000)).value;
  for (const s of result.samples) {
    const center = s.sourceSamples[4]!.sourcePointNativeSensorMm;
    const expected = 10+center.x+2*center.y+s.node.wavelengthNanometers/1000 - 0.25*0.1 + 0.5*2*0.2;
    const value = result.irradianceSamples.find(v => v.node === s.node)!;
    expect(value.spectralIrradianceWattsPerSquareMeterPerNanometer).toBeCloseTo(expected, 12);
    expect(s.psf.value.coordinate.fieldYmm).toBe(-center.y);
  }
});

it("feeds post-PSF package-incident light into independently checked temporal EQE", () => {
  const sensor = sensorInput();
  sensor.spectralResponseProfile.channels = sensor.spectralResponseProfile.channels.map(c =>
    c.kind === "separable-channel-filter-and-detector-eqe" ? c : { ...c, responseScope: "sensor-package-incident-effective-channel-response" });
  sensor.responseApplication.sourcePlane.value = "sensor-package-incident";
  const { irradianceSamples, stationarityProfile, ...shared } = sensor;
  void irradianceSamples; void stationarityProfile;
  const result = calculateSensorEqeTemporalExposure({ ...shared, samples: [1,3].map((light,i) => ({ temporalSampleIndex:i,
    timeSecondsFromOpeningReference: (i+.5)*.005,
    irradianceSamples: calculateSensorPsfIrradianceQuadrature(request((i+.5)*.005,()=>light)).value.irradianceSamples })) }).value;
  const expected = [425,475].reduce((sum,nm)=>sum+2*480000e-12*50*nm*1e-9/(6.62607015e-34*299792458)*(0.2+(nm-400)*.004)*.01,0);
  expect(result.expectedGeneratedElectronCount/expected).toBeCloseTo(1,14);
});

it("resolves wavelength-dependent shapes rather than an averaged broadband kernel", () => {
  const r=request(0,(x)=>10+x);
  r.psf.profile.nodes=r.psf.profile.nodes.map(n=>({...n,kernel:{...n.kernel,
    normalizedIntensity:n.coordinate.wavelengthNm===400?[0,0,0,0,1,0,0,0,0]:[0,0,0,0,0,1,0,0,0]}}));
  const result=calculateSensorPsfIrradianceQuadrature(r).value;
  for(const s of result.samples){
    const expected=10+s.sourceSamples[4]!.sourcePointNativeSensorMm.x-(s.node.wavelengthNanometers-400)/100*0.1;
    expect(result.irradianceSamples.find(v=>v.node===s.node)!.spectralIrradianceWattsPerSquareMeterPerNanometer).toBeCloseTo(expected,12);
  }
});

it.each(["missing", "duplicate", "sparse", "coordinate", "negative", "time", "basis", "model", "stage", "budget", "field", "invalid-time", "array", "node", "evidence"])("rejects %s", fault => {
  const r = request();
  const node=r.samples[0]!;
  if(fault==="missing")node.sourceSamples=node.sourceSamples.slice(1);
  if(fault==="duplicate")node.sourceSamples=node.sourceSamples.map(()=>node.sourceSamples[0]!);
  if(fault==="sparse")node.sourceSamples=new Array(9);
  if(fault==="coordinate")node.sourceSamples[0]!.sourcePointNativeSensorMm.y *= -1;
  if(fault==="negative")node.sourceSamples[0]!.spectralIrradianceWattsPerSquareMeterPerNanometer=-1;
  if(fault==="time")node.sourceSamples[0]!.timeSecondsFromOpeningReference=1;
  if(fault==="basis")r.psfWavelengthBasis.value="air";
  if(fault==="model")r.spatialModel.kind="other" as typeof r.spatialModel.kind;
  if(fault==="stage")r.inputMeaning="other" as typeof r.inputMeaning;
  if(fault==="budget")node.sourceSamples=new Array(100001);
  if(fault==="field")r.psf.profile.axes.fieldYmm=[20,30];
  if(fault==="invalid-time")r.timeSecondsFromOpeningReference=NaN;
  if(fault==="array")node.sourceSamples=null as unknown as typeof node.sourceSamples;
  if(fault==="node")node.node.wavelengthNanometers=999;
  if(fault==="evidence")r.spatialModel.evidence=[];
  expect(()=>calculateSensorPsfIrradianceQuadrature(r)).toThrow();
});
