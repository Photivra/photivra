// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { calculateSensorPsfIrradianceQuadrature, calculateSensorEqeTemporalExposure } from "../src/index.js";
import { input as sensorInput } from "./helpers/eqe-exposure-fixture.js";
import { psfInput as request } from "./helpers/psf-quadrature-fixture.js";


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
