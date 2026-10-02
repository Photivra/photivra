// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { calculateEnvironmentSensorPhotoSignal, simulateEnvironmentSensorRawFrame, createPhotographicExportPair,
  calculateCaptureExposureWindows, parseSceneIlluminationTemporalProfile, type CalculateEnvironmentSensorPhotoSignalInput, type SimulateEnvironmentSensorRawFrameInput,
  type SceneRadianceEvaluationRequest, type SceneRadianceEvaluationResult } from "../src/index.js";
import { input as sensorInput, producerSiteInput } from "./helpers/eqe-exposure-fixture.js";
import { sceneOpticalInput } from "./helpers/scene-optical-quadrature-fixture.js";
import { psfInput } from "./helpers/psf-quadrature-fixture.js";
import { evidence } from "./helpers/eqe-response-fixture.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

function evaluator(request: Readonly<SceneRadianceEvaluationRequest>, scale = 1): SceneRadianceEvaluationResult {
  return { schemaVersion: "0.1.0", sampleId: request.sampleId, sceneId: request.sceneId, providerProfileId: request.providerProfileId,
    wavelengthNanometers: request.wavelengthNanometers, wavelengthBasis: request.wavelengthBasis,
    quantity: "outgoing-spectral-radiance", unit: "W/m^2/sr/nm",
    spectralRadianceWattsPerSquareMeterSteradianNanometer: scale*(1+200*request.timeSecondsFromExposureStart),
    scientificStatus: "approximation", uncertainty: { kind: "not-quantified", limitation: "Owned analytic environment only." },
    evidence: evidence("test:executed-environment"), limitations: ["Synthetic time-varying uniform angular field."] };
}
function siteInput(base = sensorInput(), psf = true): CalculateEnvironmentSensorPhotoSignalInput {
  base.spectralResponseProfile.channels = base.spectralResponseProfile.channels.map(c => c.kind === "separable-channel-filter-and-detector-eqe" ? c :
    { ...c, responseScope: "sensor-package-incident-effective-channel-response" });
  base.responseApplication.sourcePlane.value = "sensor-package-incident";
  const { irradianceSamples, stationarityProfile, ...sensor } = base;void irradianceSamples;void stationarityProfile;
  const scene = sceneOpticalInput(base), p = psfInput();
  scene.sceneBindings.providerProfile.illuminationTemporalProfileId = "time-lights";
  scene.sceneBindings.illuminationTemporalProfile = parseSceneIlluminationTemporalProfile({ schemaVersion: "0.1.0", profileId: "time-lights",
    sceneId: "room", illuminationProfileId: "lights", evidence: evidence("test:time-lights"),
    waveforms: [{ waveformId: "ramp", kind: "aperiodic-relative-multiplier", timeUnit: "s", scientificStatus: "approximation",
      uncertainty: { kind: "not-quantified", limitation: "Synthetic linear light ramp." }, evidence: evidence("test:ramp"),
      interpolation: "piecewise-linear", outsideSupportBehavior: "zero", samples: [
        { timeSecondsFromWaveformReference: 0, relativeMagnitudeMultiplier: 1 },
        { timeSecondsFromWaveformReference: 1, relativeMagnitudeMultiplier: 201 }] }],
    sourceBindings: [{ bindingId: "sky-time", sourceId: "sky", waveformId: "ramp", captureTimeReference: "first-opening-boundary-phase",
      waveformTimeZeroSecondsFromCaptureReference: 0, scientificStatus: "approximation",
      timingUncertainty: { kind: "not-quantified", limitation: "Owned exact synthetic clock." }, evidence: evidence("test:sky-time") }],
    baseIlluminationProfileRemainsAuthoritative: true, sensorReadoutTimingUsedAsExposureTiming: false, automaticExposurePolicyIncluded: false });
  return { temporalIntegrationId: "environment-test", sensor, sceneBindings: scene.sceneBindings, optics: scene.optics,
    motion: { angularVelocityRadPerSec: { pitch: .2, yaw: .4, roll: .3 }, timeReference: "first-opening-boundary-phase",
      environmentDirectionConvention: "outgoing-radiance-toward-camera" }, temporalSampleCount: 2,
    fieldThroughput: { kind: "unity", evidence: evidence("test:unity"), limitation: "Declared unity field throughput." },
    psf: psf ? { kind: "sampled-local", configuration: { psf: p.psf, psfWavelengthBasis: p.psfWavelengthBasis, spatialModel: p.spatialModel } } :
      { kind: "not-applied", evidence: evidence("test:no-psf"), limitation: "Point optics only; no lens blur." }, evaluateRadiance: evaluator };
}
function frameInput(rolling = false, sampledPsf = false): SimulateEnvironmentSensorRawFrameInput {
  const raw = loadSensorRawProducerInput(), ev = raw.frame.colorSamplingProfile.evidence;
  const scan = { kind: "uniform-linear-native-scan" as const, directionNative: { value: "right-to-left" as const, evidence: ev },
    traversalDurationSeconds: { value: .002, unit: "s" as const, evidence: ev } };
  const exposureWindow = { shutterMechanism: "electronic" as const, nominalExposureDurationSeconds: {
    value: raw.frame.capture.exposure.shutterSeconds, unit: "s" as const, evidence: ev },
    opening: rolling ? scan : { kind: "simultaneous" as const }, closing: rolling ? scan : { kind: "simultaneous" as const } };
  const windows = calculateCaptureExposureWindows({ ...exposureWindow, nativeRaster: raw.frame.capture.geometry.nativeRaster,
    samplePointsNative: raw.sites.map((_, i) => ({ x: i%2+.5, y: Math.floor(i/2)+.5 })) }).value;
  return { frame: raw.frame, sceneBinding: { sceneStateId: raw.frame.capture.sceneStateId, providerSceneId: "room", evidence: ev },
    exposureWindow, evaluateRadiance: q => evaluator(q, 1e-9), sites: raw.sites.map((s, i) => {
      const e = siteInput(producerSiteInput(raw, s), sampledPsf), w = windows.samples[i]!;
      e.temporalIntegrationId = `environment-site-${i}`;
      e.sensor.localExposure.exposureWindowInput = { ...exposureWindow, nativeRaster: raw.frame.capture.geometry.nativeRaster };
      e.optics.focalLengthMm = raw.frame.capture.exposure.focalLengthMm;
      e.optics.nominalFNumber = raw.frame.capture.exposure.aperture;
      e.optics.profile.applicability.focalLengthMm = { minimum: e.optics.focalLengthMm, maximum: e.optics.focalLengthMm };
      e.optics.focus = raw.frame.capture.focus.kind === "infinity" ? { kind: "infinity-focus" } :
        { kind: "ideal-symmetric-thin-lens", objectDistanceM: raw.frame.capture.focus.distanceM, pupilMagnificationAssumption: "unity" };
      if(e.psf.kind === "sampled-local") {
        const configuration=e.psf.configuration.psf;
        configuration.focalLengthMm=e.optics.focalLengthMm;configuration.apertureFNumber=e.optics.nominalFNumber;configuration.focus=raw.frame.capture.focus;
        const diopters=configuration.focus.kind === "infinity" ? 0 : 1/configuration.focus.distanceM;
        configuration.profile.axes.focalLengthMm=[configuration.focalLengthMm];configuration.profile.axes.apertureFNumber=[configuration.apertureFNumber];configuration.profile.axes.focusDiopters=[diopters];
        configuration.profile.nodes=configuration.profile.nodes.map(n=>({...n,coordinate:{...n.coordinate,focalLengthMm:configuration.focalLengthMm,apertureFNumber:configuration.apertureFNumber,focusDiopters:diopters}}));
      }
      const { evaluateRadiance, ...environment } = e;void evaluateRadiance;
      const { charge: old, ...readout } = s;
      const { photoSignal, darkCharge, ...charge } = old;void darkCharge;
      charge.completenessProfile.startOffsetSecondsFromOpeningReference = w.startOffsetSecondsFromOpeningReference;
      charge.completenessProfile.endOffsetSecondsFromOpeningReference = w.endOffsetSecondsFromOpeningReference;
      return { environment, readout, charge, operatingTemperatureC: 20, darkCurrentProfile: { schemaVersion: "0.1.0", profileId: "dark-test",
        colorSamplingProfileId: photoSignal.colorSamplingProfileId, channelId: photoSignal.channelId, scientificStatus: "approximation",
        evidence: ev, uncertainty: { kind: "not-quantified", limitation: "Synthetic dark fixture." },
        chargeMeaning: "pre-compensation-thermally-generated-electrons", siteApplicability: { kind: "exact-site", site: photoSignal.site },
        temperatureModel: { kind: "fixed-reference-temperature", referenceTemperatureC: 20, darkCurrentElectronsPerSecond: 4 },
        darkCurrentCompensationIncluded: false, spatialDarkCurrentNonuniformityModeled: true } };
    }) };
}

it.each([false, true])("executes every source query and independently integrates SI photon/EQE counts (psf=%s)", psf => {
  const input = siteInput(sensorInput(), psf), { evaluateRadiance: _, ...data } = input;void _;
  const before = structuredClone(data), queries: SceneRadianceEvaluationRequest[] = [];
  input.evaluateRadiance = (q): SceneRadianceEvaluationResult => { expect(Object.isFrozen(q.target.outgoingDirectionUnitVector)).toBe(true);queries.push(q);return evaluator(q); };
  const result = calculateEnvironmentSensorPhotoSignal(input).value;
  const expected = [425,475].reduce((sum,nm) => sum + 2*Math.PI/64*(.8-(nm-400)*.004)*480000e-12*50*nm*1e-9/(6.62607015e-34*299792458)*(.2+(nm-400)*.004)*.01,0);
  expect(result.photo.value.photoSignal.expectedGeneratedElectronCount/expected).toBeCloseTo(1,14);
  expect(result.providerEvaluationCount).toBe(psf ? 144 : 16);
  expect(queries).toHaveLength(result.providerEvaluationCount);
  expect(new Set(queries.map(q=>q.sampleId)).size).toBe(queries.length);
  expect(result).toMatchObject({providerCallbackExecuted:true,providerTransportVerified:false,sceneVisibilityCalculated:false,productionPlanActivated:false});
  expect(result.instants[0]!.evaluations[0]!.query.value.sourcePointImagePlaneMm.y).toBe(-result.instants[0]!.evaluations[0]!.query.value.sourcePointNativeSensorMm.y);
  expect(data).toEqual(before);
});

it("angular environment gradients see distinct rotated inverse PSF rays including zero-weight taps",()=>{
  const input=siteInput(), seen: number[]=[];
  input.evaluateRadiance=(q): SceneRadianceEvaluationResult => {seen.push(q.target.outgoingDirectionUnitVector.x);const r=evaluator(q);r.spectralRadianceWattsPerSquareMeterSteradianNanometer=(2+q.target.outgoingDirectionUnitVector.x)*(1+200*q.timeSecondsFromExposureStart);return r;};
  const result=calculateEnvironmentSensorPhotoSignal(input).value;
  expect(new Set(seen).size).toBeGreaterThan(8);
  const instant=result.instants[0]!, psf=instant.psf!.value;
  for(let i=0;i<psf.samples.length;i++){
    const values=instant.evaluations.slice(i*9,(i+1)*9).map(e=>e.optics.value.sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer);
    const expected=.25*values[4]!+.25*values[5]!+.5*values[7]!;
    expect(psf.irradianceSamples[i]!.spectralIrradianceWattsPerSquareMeterPerNanometer).toBeCloseTo(expected,14);
  }
});

it.each([[false,false],[true,false],[false,true],[true,true]])("commits local times through dark/noise/ADC and paired DNG/JPEG (rolling=%s, psf=%s)",async (rolling,sampledPsf)=>{
  const input=frameInput(rolling,sampledPsf), result=simulateEnvironmentSensorRawFrame(input);
  expect(simulateEnvironmentSensorRawFrame(input)).toEqual(result);
  expect(result.value.raw.value.upstreamRadiometryVerified).toBe(false);
  const ids=result.value.sites.flatMap(s=>s.value.instants.flatMap(t=>t.evaluations.map(e=>e.query.value.request.sampleId)));
  expect(new Set(ids).size).toBe(ids.length);
  result.value.sites.forEach((s,i)=>{
    const p=s.value.photo.value.photoSignal;
    expect(result.value.raw.value.sites[i]!.accumulatedCharge.value.totalExpectedStoredElectronCount).toBe(p.expectedGeneratedElectronCount+4*p.localExposureDurationSeconds);
    if(rolling)expect(p.startOffsetSecondsFromOpeningReference).toBeGreaterThan(0);
  });
  const output=loadPhotographicExportInput();output.reconstruction.rawFrame=result.value.raw.value.frame;
  const pair=await createPhotographicExportPair(output);
  expect(await createPhotographicExportPair(output)).toEqual(pair);
  expect(pair.imageDataPairing).toBe("jpeg-generated-from-exact-attached-raw");
  const bytes=pair.dng.bytes, view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let strip=-1;
  for(let i=0;i<view.getUint16(8,true);i++){const o=10+12*i;if(view.getUint16(o,true)===273)strip=view.getUint32(o+8,true);}
  expect(strip).toBeGreaterThan(0);
  expect(Array.from({length:4},(_,i)=>view.getUint16(strip+2*i,true))).toEqual(result.value.raw.value.frame.samples.map(s=>s.rawCode));
});

it.each(["count","clock","plane","basis","psf-state","psf-evidence","budget","behind","unity"])("rejects invalid site preflight before provider invocation: %s",fault=>{
  const r=siteInput();let calls=0;r.evaluateRadiance=(q): SceneRadianceEvaluationResult => {calls++;return evaluator(q);};
  if(fault==="count")r.temporalSampleCount=257;
  if(fault==="clock")r.motion.timeReference="other" as typeof r.motion.timeReference;
  if(fault==="plane")r.sensor.responseApplication.sourcePlane.value="site-incident";
  if(fault==="basis"&&r.psf.kind==="sampled-local")r.psf.configuration.psfWavelengthBasis.value="air";
  if(fault==="psf-state"&&r.psf.kind==="sampled-local")r.psf.configuration.psf.apertureFNumber=8;
  if(fault==="psf-evidence"&&r.psf.kind==="sampled-local")r.psf.configuration.spatialModel.evidence=[];
  if(fault==="budget"){r.temporalSampleCount=256;r.sensor.spatialSampling.spatialSampleCountX=16;r.sensor.spatialSampling.spatialSampleCountY=16;}
  if(fault==="behind")r.motion.angularVelocityRadPerSec.yaw=1000;
  if(fault==="unity")r.fieldThroughput.evidence=[];
  expect(()=>calculateEnvironmentSensorPhotoSignal(r)).toThrow();expect(calls).toBe(0);
});

it.each(["identity","basis","negative","promise","throw","mutation"])("fails closed on provider behavior: %s",fault=>{
  const r=siteInput();r.evaluateRadiance=(q): SceneRadianceEvaluationResult => {
    if(fault==="throw")throw Error("provider unavailable");
    if(fault==="mutation"){q.target.outgoingDirectionUnitVector.x=99;}
    const s=evaluator(q);if(fault==="identity")s.sampleId="stale";if(fault==="basis")s.wavelengthBasis="air";
    if(fault==="negative")s.spectralRadianceWattsPerSquareMeterSteradianNanometer=-1;
    return fault==="promise"?Promise.resolve(s) as unknown as SceneRadianceEvaluationResult:s;
  };expect(()=>calculateEnvironmentSensorPhotoSignal(r)).toThrow();
});

it.each(["missing","sparse","site","geometry","focus","scene","time","duration","duplicate","event","aggregate-budget","motion-drift","optics-drift","psf-drift"])("rejects frame mismatch before provider invocation: %s",fault=>{
  const {evaluateRadiance,...data}=frameInput();const r={...structuredClone(data),evaluateRadiance};let calls=0;r.evaluateRadiance=(q): SceneRadianceEvaluationResult => {calls++;return evaluator(q);};
  if(fault==="missing")r.sites=r.sites.slice(1);if(fault==="sparse")r.sites=new Array(4);
  if(fault==="site")r.sites[0]!.environment.sensor.spatialSampling.site.x=1;
  if(fault==="geometry")r.sites[0]!.environment.sensor.spatialSampling.imagingArea={...r.sites[0]!.environment.sensor.spatialSampling.imagingArea,widthMm:99};
  if(fault==="focus")r.sites[0]!.environment.optics.focus={kind:"ideal-symmetric-thin-lens",objectDistanceM:100,pupilMagnificationAssumption:"unity"};
  if(fault==="scene")r.sceneBinding.sceneStateId="stale";
  if(fault==="time")r.frame.capture.sceneTimeSeconds=1;
  if(fault==="duration")r.exposureWindow.nominalExposureDurationSeconds.value*=2;
  if(fault==="duplicate")r.sites[1]!.environment.temporalIntegrationId=r.sites[0]!.environment.temporalIntegrationId;
  if(fault==="event")r.sites[0]!.environment.sensor.localExposure.exposureWindowInput.closing={kind:"uniform-linear-native-scan",directionNative:{value:"top-to-bottom",evidence:evidence("test:scan")},traversalDurationSeconds:{value:.002,unit:"s",evidence:evidence("test:scan")}};
  if(fault==="motion-drift")r.sites[1]!.environment.motion.angularVelocityRadPerSec.yaw=9;
  if(fault==="optics-drift")r.sites[1]!.environment.optics.profile.profileVersion="other";
  if(fault==="psf-drift"&&r.sites[1]!.environment.psf.kind==="not-applied")r.sites[1]!.environment.psf.limitation="Different lens path.";
  if(fault==="aggregate-budget")for(const site of r.sites){site.environment.temporalSampleCount=256;site.environment.sensor.spatialSampling.spatialSampleCountX=8;site.environment.sensor.spatialSampling.spatialSampleCountY=8;}
  expect(()=>simulateEnvironmentSensorRawFrame(r)).toThrow();expect(calls).toBe(0);
});

it("snapshots caller state against callback changes and preserves canonical property ordering",()=>{
  const r=frameInput(), altered=r.sites[0]!.environment;
  const profile=altered.optics.profile;
  altered.optics.profile={...profile,profileId:profile.profileId};
  const expected=simulateEnvironmentSensorRawFrame(r);
  let changed=false;
  r.evaluateRadiance=(q): SceneRadianceEvaluationResult=>{
    if(!changed){changed=true;altered.optics.focalLengthMm=999;r.exposureWindow.nominalExposureDurationSeconds.value=9;}
    return evaluator(q,1e-9);
  };
  expect(simulateEnvironmentSensorRawFrame(r)).toEqual(expected);
});
